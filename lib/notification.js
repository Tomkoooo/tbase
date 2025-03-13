import jwt from 'jsonwebtoken';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);

class Notification {
  constructor(db = null) {
    this.subscriptions = new Map(); // Map: userId -> { count: number, subscriptions: Set }
    this.vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC;
    this.vapidPrivateKey = process.env.NEXT_PUBLIC_VAPID_PRIVATE;
    this.vapidEmail = process.env.NEXT_PUBLIC_VAPID_MAIL;
    console.log('Backend VAPID Public Key:', this.vapidPublicKey);
    console.log('Backend VAPID Private Key:', this.vapidPrivateKey);
    console.log('VAPID Email:', this.vapidEmail);

    // APNs configuration
    this.apnsTeamId = process.env.NEXT_PUBLIC_APNS_TEAM_ID;
    this.apnsKeyId = process.env.NEXT_PUBLIC_APNS_KEY_ID;
    const apnsKeyFile = process.env.NEXT_PUBLIC_APNS_KEY_FILE || "";
    if (fs.existsSync(apnsKeyFile)) {
      this.apnsKey = fs.readFileSync(apnsKeyFile, 'utf8');
    } else {
      this.apnsKey = "";
      console.warn('APNs key file not found at:', apnsKeyFile);
    }
    this.apnsBundleId = process.env.NEXT_PUBLIC_APNS_BUNDLE_ID;
    console.log('APNs Team ID:', this.apnsTeamId);
    console.log('APNs Key ID:', this.apnsKeyId);
    console.log('APNs Bundle ID:', this.apnsBundleId);

    if (!this.vapidPublicKey || !this.vapidPrivateKey || !this.vapidEmail) {
      throw new Error('VAPID keys and email are required');
    }
    if (!this.apnsTeamId || !this.apnsKeyId || !this.apnsKey || !this.apnsBundleId) {
      console.warn('APNs configuration is incomplete');
    }

    // Use provided db or fallback with custom logic
    this.db = db || {
      storeSubscription: async (userId, subscription) => {
        console.log(`Mock storeSubscription - User: ${userId}, Subscription:`, subscription);
        const subscriptionStr = JSON.stringify(subscription);
        console.log(`Stored subscription for ${userId} in mock DB:`, { userId, subscription: subscriptionStr, createdAt: new Date() });
      },
      upsert: async (table, data) => {
        console.log(`Mock upsert - Table: ${table}, Data:`, data);
        // Simulate in-memory storage for consistency
        const { userId, subscription } = data;
        if (!this.subscriptions.has(userId)) {
          this.subscriptions.set(userId, { count: 0, subscriptions: new Set() });
        }
        const userData = this.subscriptions.get(userId);
        const subscriptionStr = JSON.stringify(subscription);
        if (!userData.subscriptions.has(subscriptionStr)) {
          userData.count += 1;
          userData.subscriptions.add(subscriptionStr);
        }
      },
      delete: async (table, query) => {
        console.log(`Mock delete - Table: ${table}, Query:`, query);
        // Simulate in-memory deletion
        const { userId, subscription } = query;
        if (this.subscriptions.has(userId)) {
          const userData = this.subscriptions.get(userId);
          const subscriptionStr = JSON.stringify(subscription);
          if (userData.subscriptions.has(subscriptionStr)) {
            userData.subscriptions.delete(subscriptionStr);
            userData.count -= 1;
            if (userData.count === 0) {
              this.subscriptions.delete(userId);
            }
          }
        }
      },
      find: async (table, query) => {
        console.log(`Mock find - Table: ${table}, Query:`, query);
        return []; // Empty by default; could return this.subscriptions if pre-populated
      },
    };

    // Initialize web-push and load subscriptions if a real DB is provided
    this.initWebPush();
    if (db) {
      this.loadSubscriptions().catch(err => console.error('Failed to load subscriptions:', err));
    }
  }

  generateApnsJwt() {
    const token = jwt.sign(
      { iss: this.apnsTeamId, iat: Math.floor(Date.now() / 1000) },
      this.apnsKey,
      { algorithm: 'ES256', header: { alg: 'ES256', kid: this.apnsKeyId } }
    );
    return token;
  }

  async sendApnsRequest(subscription, notification) {
    const endpoint = subscription.endpoint;
    const jwtToken = this.generateApnsJwt();
    const payload = JSON.stringify({
      aps: {
        alert: {
          title: notification.title || 'Notification',
          body: notification.message || 'You have a new message',
        },
        sound: 'default',
      },
    });

    const curlCommand = `curl -v -d '${payload}' \
      -H "apns-topic: ${this.apnsBundleId}" \
      -H "authorization: bearer ${jwtToken}" \
      -H "content-type: application/json" \
      ${endpoint}`;

    try {
      const { stdout, stderr } = await execPromise(curlCommand);
      console.log('APNs response:', stdout);
      if (stderr) console.error('APNs stderr:', stderr);
      return stdout;
    } catch (error) {
      console.error('APNs error:', error.stderr || error.message);
      throw error;
    }
  }

  async initWebPush() {
    const webPush = await import('web-push');
    webPush.default.setVapidDetails(this.vapidEmail, this.vapidPublicKey, this.vapidPrivateKey);
    this.webPush = webPush.default;
    console.log('web-push initialized');
  }

  async subscribe(userId, subscription) {
    if (!this.subscriptions.has(userId)) {
      this.subscriptions.set(userId, { count: 0, subscriptions: new Set() });
    }
    const userData = this.subscriptions.get(userId);
    const subscriptionStr = JSON.stringify(subscription);

    if (!userData.subscriptions.has(subscriptionStr)) {
      userData.count += 1;
      userData.subscriptions.add(subscriptionStr);

      // Use storeSubscription if available, otherwise upsert
      if (typeof this.db.storeSubscription === 'function') {
        await this.db.storeSubscription(userId, subscription);
      } else {
        await this.db.upsert('push_subscriptions', { userId, subscription });
      }
      console.log(`User ${userId} subscribed. Count: ${userData.count}`);
    }
  }

  async unsubscribe(userId, subscription) {
    if (!this.subscriptions.has(userId)) return;
    const userData = this.subscriptions.get(userId);
    const subscriptionStr = JSON.stringify(subscription);

    if (userData.subscriptions.has(subscriptionStr)) {
      userData.subscriptions.delete(subscriptionStr);
      userData.count -= 1;

      await this.db.delete('push_subscriptions', { userId, subscription });

      if (userData.count === 0) {
        this.subscriptions.delete(userId);
        console.log(`User ${userId} fully unsubscribed`);
      } else {
        console.log(`User ${userId} unsubscribed from one instance. Count: ${userData.count}`);
      }
    }
  }

  async send(userId, notification) {
    if (!this.webPush) {
      await this.initWebPush();
    }

    console.log('Subscriptions before send:', Array.from(this.subscriptions.entries()));
    const userData = this.subscriptions.get(userId);
    if (!userData || userData.count === 0) {
      console.log(`User ${userId} is not subscribed`);
      return;
    }

    for (const subscriptionStr of userData.subscriptions) {
      const subscription = JSON.parse(subscriptionStr);
      const payload = notification;

      try {
        if (subscription.endpoint.includes('apple.com')) {
          await this.sendApnsRequest(subscription, payload);
          console.log(`APNs notification sent to ${userId}`);
        } else {
          await this.webPush.sendNotification(subscription, JSON.stringify(payload));
          console.log(`Web push notification sent to ${userId}`);
        }
      } catch (error) {
        console.error(`Failed to send to ${userId}: ${error.statusCode || ''} - ${error.body || error.message}`);
        if (error.statusCode === 410 || error.message.includes('expired')) {
          await this.unsubscribe(userId, subscription);
          console.log(`Subscription for ${userId} expired, removed`);
        }
      }
    }
  }

  async loadSubscriptions() {
    const subscriptions = await this.db.find('push_subscriptions', {});
    for (const { userId, subscription } of subscriptions) {
      if (!this.subscriptions.has(userId)) {
        this.subscriptions.set(userId, { count: 0, subscriptions: new Set() });
      }
      const userData = this.subscriptions.get(userId);
      const subscriptionStr = JSON.stringify(subscription);
      if (!userData.subscriptions.has(subscriptionStr)) {
        userData.count += 1;
        userData.subscriptions.add(subscriptionStr);
      }
    }
    console.log('Loaded subscriptions from database:', Array.from(this.subscriptions.entries()));
  }
}

export default Notification;