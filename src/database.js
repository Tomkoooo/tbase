import { MongoClient } from "mongodb";
import mysql from "mysql2/promise";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

class Database {
  async connect(connectionInfo) {}
  async watchChanges(collectionName, callback, options) {}
  async execute(method) {}
  async close() {}

  constructor(type, connection) {
    this.type = type; // "mongodb" vagy "mysql"
    this.connection = connection; // MongoDB db objektum vagy MySQL connection
  }

  // Közös segédfüggvény: ObjectId konverzió MongoDB-hez
  toObjectId(id) {
    return this.type === "mongodb" ? new ObjectId(id) : id;
  }

//---- Account Scope ----

  // Regisztráció (signup)
  async signUp(payload) {
    try {
      const { email, password, isSuper } = payload;
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);

      if (this.type === "mongodb") {
        const existingUser = await this.db
          .collection("users")
          .findOne({ email });
        if (existingUser) throw new Error("User already exists");
        const result = await this.db.collection("users").insertOne({
          email,
          password: hashedPassword,
          createdAt: new Date(),
          labels: [],
          preferencies: {},
          verified: false,
          isSuper: isSuper || false,
        });

        return result.insertedId;
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(
          "SELECT * FROM users WHERE email = ?",
          [email]
        );
        if (rows.length > 0) throw new Error("User already exists");
        const [result] = await this.db.execute(
          "INSERT INTO users (email, password, isSuper) VALUES (?, ?, ?)",
          [email, hashedPassword, isSuper || false]
        );
        return result.insertId.toString();
      }
    } catch (err) {
      throw new Error(err.message || "Error during signup");
    }
  }

  async signInSuper(email, password, isSuper) {
    try {
      if (this.type === "mongodb") {
        const user = await this.db.collection("users").findOne({ email});
        if (!user || !bcrypt.compare(password, user.password) || (isSuper !== user.isSuper || !isSuper || !user.isSuper)) {
          throw new Error("Invalid credentials");
        }
        const csrUser = {_id: user._id, ...user}
        return { user: csrUser };
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(
          "SELECT * FROM users WHERE email = ?",
          [email]
        );
        const user = rows[0];
        if (!user || !bcrypt.compare(password, user.password)) {
          throw new Error("Invalid credentials");
        }
        return { user};
      }
    } catch (err) {
      throw new Error(err.message || "Error during signin");
    }
  }

  // Bejelentkezés (signin)
  async signIn(email, password, isSuper) {
    try {
      if (this.type === "mongodb") {
        const user = await this.db.collection("users").findOne({ email});
        if (!user || !bcrypt.compare(password, user.password)) {
          throw new Error("Invalid credentials");
        }
        const csrUser = {_id: user._id, ...user}
        return { user: csrUser };
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(
          "SELECT * FROM users WHERE email = ?",
          [email]
        );
        const user = rows[0];
        if (!user || !bcrypt.compare(password, user.password)) {
          throw new Error("Invalid credentials");
        }
        return { user};
      }
    } catch (err) {
      throw new Error(err.message || "Error during signin");
    }
  }

  // Felhasználó lekérdezése (getAccount)
  async getAccount(userId) {
    try {
      if (this.type === "mongodb") {
        const user = await this.db
          .collection("users")
          .findOne(
            { _id: this.toObjectId(userId) },
            { projection: { password: 0 } }
          );
        if (!user) throw new Error("User not found");
        return {
          user
        };
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(
          "SELECT * FROM users WHERE id = ?",
          [userId]
        );
        const user = rows[0];
        if (!user) throw new Error("User not found");
        return user;
      }
    } catch (err) {
      throw new Error(err.message || "Error retrieving account");
    }
  }

  async getSession(token) {
    try {
      if (this.type === "mongodb" && this.db) {
        if (token) {
          const session = await this.db.collection("sessions").findOne({ token });
          if (!session) return null;
          return {
            userId: session.userId,
            token: session.token,
            data: session.data,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          };
        } else {
          const sessions = await this.db.collection("sessions").find({ userId }).toArray();
          return sessions.map((s) => ({
            userId: s.userId,
            token: s.token,
            data: s.data,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          }));
        }
      } else if (this.type === "mysql" && this.db) {
        if (token) {
          const [rows] = await this.db.execute(
            "SELECT * FROM sessions WHERE token = ?",
            [token]
          );
          if (rows.length === 0) return null;
          const session = rows[0];
          return {
            userId: session.userId,
            token: session.token,
            data: session.data ? JSON.parse(session.data) : null,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          };
        } else {
          const [rows] = await this.db.execute(
            "SELECT user_id AS userId, token, data, created_at AS createdAt, updated_at AS updatedAt FROM sessions WHERE user_id = ?",
            [userId]
          );
          return rows.map((r) => ({
            userId: r.userId,
            token: r.token,
            data: r.data ? JSON.parse(r.data) : null,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }));
        }
      }
      throw new Error("Database not initialized");
    } catch (err) {
      throw new Error(err.message || "Error getting session");
    }
  }

  async getSessions(userId) {
    try {
      if (this.type === "mongodb" && this.db) {
        const sessions = await this.db.collection("sessions").find({ userId }).toArray();
        if (sessions.length === 0) throw new Error("Sessions not found");
        return sessions
      } else if (this.type === "mysql" && this.db) {
        const [rows] = await this.db.execute(
          "SELECT * FROM sessions WHERE user_id = ?",
          [userId]
        );
        if (rows.length === 0) throw new Error("Sessions not found");
        return rows
      }
      throw new Error("Database not initialized");
    } catch (err) {
      throw new Error(err.message || "Error retrieving sessions");
    }
  }

  async setSession(userId, token) {
    try {
      if (this.type === "mongodb" && this.db) {
        await this.db.collection("sessions").insertOne({
          userId,
          token,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else if (this.type === "mysql" && this.db) {
        await this.db.execute(
          "INSERT INTO sessions (user_id, token) VALUES (?, ?)",
          [userId, token]
        );
      } else {
        throw new Error("Database not initialized");
      }
    } catch (err) {
      throw new Error(err.message || "Error setting session");
    }
  }

  async killSession(token) {
    try {
      if (this.type === "mongodb" && this.db) {
        console.log("token", token);
        const result = await this.db.collection("sessions").deleteOne({ token });
        if (result.deletedCount === 0) throw new Error("Session not found");
      } else if (this.type === "mysql" && this.db) {
        const [result] = await this.db.execute(
          "DELETE FROM sessions WHERE token = ?",
          [token]
        );
        if (result.affectedRows === 0) throw new Error("Session not found");
      } else {
        throw new Error("Database not initialized");
      }
    } catch (err) {
      throw new Error(err.message || "Error killing session");
    }
  }

  async killSessions(userId) {
    try {
      if (this.type === "mongodb" && this.db) {
        const result = await this.db.collection("sessions").deleteMany({ userId });
        if (result.deletedCount === 0) throw new Error("Session not found");
      } else if (this.type === "mysql" && this.db) {
        const [result] = await this.db.execute(
          "DELETE FROM sessions WHERE user_id = ? AND token = ?",
          [userId, token]
        );
        if (result.affectedRows === 0) throw new Error("Session not found");
      } else {
        throw new Error("Database not initialized");
      }
    } catch (err) {
      throw new Error(err.message || "Error killing session");
    }
  }

  async changeSession(token, data) {
    try {
      if (this.type === "mongodb" && this.db) {
        const result = await this.db.collection("sessions").updateOne(
          { token },
          { $set: { token: data, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) throw new Error("Session not found");
      } else if (this.type === "mysql" && this.db) {
        const [result] = await this.db.execute(
          "UPDATE sessions SET token = ?, WHERE token = ?",
          [data, token]
        );
        if (result.affectedRows === 0) throw new Error("Session not found");
      } else {
        throw new Error("Database not initialized");
      }
    } catch (err) {
      throw new Error(err.message || "Error changing session");
    }
  }
//---- User Scope ----

  //get a specific user
  async getUser(userId) {
    try {
      if (this.type === "mongodb") {
        const user = await this.db.collection("users").findOne({ _id: this.toObjectId(userId) });
        if (!user) throw new Error("User not found");
        return {
          user
        };
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute("SELECT * FROM users WHERE id = ?", [userId]);
        if (rows.length === 0) throw new Error("User not found");
        return rows[0];
      }
    } catch (err) {
      throw new Error(err.message || "Error retrieving user");
    }
  }
 // get multiple usrs
  async getUsers(userIds){
      try {
        if (!Array.isArray(userIds) || userIds.length === 0) {
          throw new Error("userIds must be a non-empty array");
        }
    
        if (this.type === "mongodb") {
          const users = await this.db
            .collection("users")
            .find({ _id: { $in: userIds.map((id) => this.toObjectId(id)) } })
            .toArray();
          if (users.length === 0) throw new Error("Users not found");
          return users
        } else if (this.type === "mysql" && this.db) {
          const placeholders = userIds.map(() => "?").join(", ");
          const query = `SELECT id AS _id, email, created_at AS createdAt FROM users WHERE id IN (${placeholders})`;
          const [rows] = await this.db.execute(query, userIds);
          if (rows.length === 0) throw new Error("Users not found");
          return rows;
        }
        throw new Error("Database not initialized");
      } catch (err) {
        console.error("Error in getUsers:", err);
        throw new Error(err instanceof Error ? err.message : "Error retrieving users");
      }
    } 
  
  async listUsers() {
    try {
      if (this.type === "mongodb") {
        const users = await this.db.collection("users").find({}).toArray();
        return users;
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute("SELECT * FROM users");
        console.log("Rows:", rows);
        return rows;
      }
    } catch (err) {
      throw new Error(err.message || "Error listing users");
    }
  }

//---- Notification ----

  // Store a new subscription
  async storeSubscription(userId, subscription) {
    if (this.type === 'mongodb') {
      const subscriptionDoc = {
        userId,
        subscription,
        createdAt: new Date(),
      };
      const result = await this.db.collection('push_subscriptions').insertOne(subscriptionDoc);
      console.log(`Stored subscription for ${userId} in MongoDB`);
      return result.insertedId;
    } else if (this.type === 'mysql') {
      const subscriptionStr = JSON.stringify(subscription);
      const [result] = await this.db.execute(
        'INSERT INTO push_subscriptions (user_id, subscription, created_at) VALUES (?, ?, NOW())',
        [userId, subscriptionStr]
      );
      console.log(`Stored subscription for ${userId} in MySQL`);
      return result.insertId;
    } else {
      throw new Error(`Unsupported DB type: ${this.type}`);
    }
  }

  // Upsert a record (update or insert)
  async upsert(table, data) {
    if (this.type === 'mongodb') {
      const result = await this.db.collection(table).updateOne(
        { userId: data.userId },
        { $set: { subscription: data.subscription, updatedAt: new Date() } },
        { upsert: true }
      );
      console.log(`Upserted into ${table} in MongoDB:`, data);
      return result;
    } else if (this.type === 'mysql') {
      const subscriptionStr = JSON.stringify(data.subscription);
      const [result] = await this.db.execute(
        `INSERT INTO ${table} (user_id, subscription, created_at) 
         VALUES (?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE subscription = ?, updated_at = NOW()`,
        [data.userId, subscriptionStr, subscriptionStr]
      );
      console.log(`Upserted into ${table} in MySQL:`, data);
      return result;
    } else {
      throw new Error(`Unsupported DB type: ${this.type}`);
    }
  }

  // Delete a record
  async delete(table, query) {
    if (this.type === 'mongodb') {
      const result = await this.db.collection(table).deleteOne({
        userId: query.userId,
        subscription: query.subscription,
      });
      console.log(`Deleted from ${table} in MongoDB:`, query);
      return { deletedCount: result.deletedCount };
    } else if (this.type === 'mysql') {
      const subscriptionStr = JSON.stringify(query.subscription);
      const [result] = await this.db.execute(
        `DELETE FROM ${table} WHERE user_id = ? AND subscription = ?`,
        [query.userId, subscriptionStr]
      );
      console.log(`Deleted from ${table} in MySQL:`, query);
      return { affectedRows: result.affectedRows };
    } else {
      throw new Error(`Unsupported DB type: ${this.type}`);
    }
  }

  // Find records
  async find(table, query) {
    if (this.type === 'mongodb') {
      const results = await this.db.collection(table).find(query).toArray();
      console.log(`Found in ${table} in MongoDB:`, results);
      return results;
    } else if (this.type === 'mysql') {
      let sql = `SELECT * FROM ${table}`;
      let params = [];
      if (Object.keys(query).length > 0) {
        sql += ' WHERE user_id = ?';
        params.push(query.userId);
      }
      const [rows] = await this.db.execute(sql, params);
      const parsedRows = rows.map(row => ({
        userId: row.user_id,
        subscription: JSON.parse(row.subscription),
        createdAt: row.created_at,
      }));
      console.log(`Found in ${table} in MySQL:`, parsedRows);
      return parsedRows;
    } else {
      throw new Error(`Unsupported DB type: ${this.type}`);
    }
  }

// ------ Bucket API ------

  // Create a new bucket
  async createBucket() {
    try {
      let bucketId = Math.random().toString(36).substring(2, 15);
      if (this.type === "mongodb") {
        this.db.createCollection(`bucket_${bucketId}`);
        console.log(`Created MongoDB bucket: bucket_${bucketId}`);
        return `bucket_${bucketId}`;
      } else if (this.type === "mysql") {
        let [rows] = await this.db.execute(`SHOW TABLES LIKE 'bucket_${bucketId}'`);
        while (rows.length > 0) {
          bucketId = Math.random().toString(36).substring(2, 15);
          [rows] = await this.db.execute(`SHOW TABLES LIKE 'bucket_${bucketId}'`);
        }
        await this.db.execute(`
          CREATE TABLE bucket_${bucketId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(255) NOT NULL,
            file_data LONGBLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        console.log(`Created MySQL bucket: bucket_${bucketId}`);
        return `bucket_${bucketId}`;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error creating bucket");
    }
  }

  // Upload a file to a bucket
  async uploadFile(bucketId, file) {
    try {
      const { name: fileName, type: fileType, data: fileData } = file; // Expecting { name, type, data } structure
      if (!fileName || !fileType || !fileData) {
        throw new Error("File name, type, and data are required");
      }

      if (this.type === "mongodb") {
        const result = await this.db.collection(bucketId).insertOne({
          file_name: fileName,
          file_type: fileType,
          file_data: Buffer.from(fileData), // Convert to Buffer for MongoDB
          created_at: new Date(),
          updated_at: new Date(),
        });
        console.log(`Uploaded file ${fileName} to ${bucketId} in MongoDB`);
        return result.insertedId;
      } else if (this.type === "mysql") {
        const [result] = await this.db.execute(`
          INSERT INTO ${bucketId} (file_name, file_type, file_data)
          VALUES (?, ?, ?)
        `, [fileName, fileType, fileData]); // fileData should be a Buffer or binary string
        console.log(`Uploaded file ${fileName} to ${bucketId} in MySQL`);
        return result.insertId;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error uploading file to bucket");
    }
  }

  // Retrieve a file from a bucket by ID
  async getFile(bucketId, fileId) {
    try {
      if (this.type === "mongodb") {
        const file = await this.db.collection(bucketId).findOne({ _id: this.toObjectId(fileId) });
        if (!file) throw new Error("File not found");
        console.log(`Retrieved file ${file.file_name} from ${bucketId} in MongoDB`);
        return {
          fileName: file.file_name,
          fileType: file.file_type,
          fileData: file.file_data.buffer, // Return Buffer as-is
        };
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(`
          SELECT file_name, file_type, file_data
          FROM ${bucketId}
          WHERE id = ?
        `, [fileId]);
        if (rows.length === 0) throw new Error("File not found");
        const file = rows[0];
        console.log(`Retrieved file ${file.file_name} from ${bucketId} in MySQL`);
        return {
          fileName: file.file_name,
          fileType: file.file_type,
          fileData: file.file_data, // LONGBLOB as Buffer
        };
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error retrieving file from bucket");
    }
  }

  // List all files in a bucket
  async listFiles(bucketId) {
    try {
      if (this.type === "mongodb") {
        const files = await this.db.collection(bucketId).find().toArray();
        console.log(`Listed ${files.length} files in ${bucketId} in MongoDB`);
        return files.map(file => ({
          id: file._id,
          fileName: file.file_name,
          fileType: file.file_type,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
        }));
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(`
          SELECT id, file_name, file_type, created_at, updated_at
          FROM ${bucketId}
        `);
        console.log(`Listed ${rows.length} files in ${bucketId} in MySQL`);
        return rows.map(row => ({
          id: row.id,
          fileName: row.file_name,
          fileType: row.file_type,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error listing files in bucket");
    }
  }

  // Delete a file from a bucket
  async deleteFile(bucketId, fileId) {
    try {
      if (this.type === "mongodb") {
        const result = await this.db.collection(bucketId).deleteOne({ _id: this.toObjectId(fileId) });
        if (result.deletedCount === 0) throw new Error("File not found");
        console.log(`Deleted file ${fileId} from ${bucketId} in MongoDB`);
        return true;
      } else if (this.type === "mysql") {
        const [result] = await this.db.execute(`
          DELETE FROM ${bucketId}
          WHERE id = ?
        `, [fileId]);
        if (result.affectedRows === 0) throw new Error("File not found");
        console.log(`Deleted file ${fileId} from ${bucketId} in MySQL`);
        return true;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error deleting file from bucket");
    }
  }

  async listBuckets() {
    try {
      if (this.type === "mongodb") {
        const collections = await this.db.listCollections().toArray();
        const buckets = collections
          .filter((col) => col.name.startsWith("bucket_"))
          .map((col) => col.name);
        console.log(`Listed ${buckets.length} buckets in MongoDB`);
        return buckets;
      } else if (this.type === "mysql") {
        const [rows] = await this.db.execute(`SHOW TABLES`);
        const buckets = rows
          .map((row) => Object.values(row)[0])
          .filter((tableName) => tableName.startsWith("bucket_"));
        console.log(`Listed ${buckets.length} buckets in MySQL`);
        return buckets;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error listing buckets");
    }
  }

  async deleteBucket(bucketId) {
    try {
      if (!bucketId.startsWith("bucket_")) {
        throw new Error("Invalid bucket ID: must start with 'bucket_'");
      }
      if (this.type === "mongodb") {
        await this.db.collection(bucketId).drop();
        console.log(`Deleted bucket ${bucketId} in MongoDB`);
        return true;
      } else if (this.type === "mysql") {
        await this.db.execute(`DROP TABLE ${bucketId}`);
        console.log(`Deleted bucket ${bucketId} in MySQL`);
        return true;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error deleting bucket");
    }
  }

  async renameBucket(oldBucketId, newBucketId) {
    try {
      if (!oldBucketId.startsWith("bucket_") || !newBucketId.startsWith("bucket_")) {
        throw new Error("Invalid bucket ID: must start with 'bucket_'");
      }
      if (oldBucketId === newBucketId) {
        throw new Error("New bucket ID must be different from the old one");
      }

      if (this.type === "mongodb") {
        await this.db.collection(oldBucketId).rename(newBucketId);
        console.log(`Renamed bucket ${oldBucketId} to ${newBucketId} in MongoDB`);
        return true;
      } else if (this.type === "mysql") {
        const [existing] = await this.db.execute(`SHOW TABLES LIKE '${newBucketId}'`);
        if (existing.length > 0) {
          throw new Error(`Bucket ${newBucketId} already exists`);
        }

        await this.db.execute(`
          CREATE TABLE ${newBucketId} LIKE ${oldBucketId}
        `);
        await this.db.execute(`
          INSERT INTO ${newBucketId} SELECT * FROM ${oldBucketId}
        `);
        await this.db.execute(`DROP TABLE ${oldBucketId}`);
        console.log(`Renamed bucket ${oldBucketId} to ${newBucketId} in MySQL`);
        return true;
      } else {
        throw new Error("Unsupported database type");
      }
    } catch (err) {
      throw new Error(err.message || "Error renaming bucket");
    }
  }

//---- Permission Scope ----
async createPermission(itemId, requireAction, requireRole = null) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `INSERT INTO permissions (item_id, require_action, require_role) VALUES (?, ?, ?)`,
        [itemId, requireAction, requireRole]
      );
      return { id: result.insertId };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("permissions").insertOne({
        item_id: itemId,
        require_action: requireAction,
        require_role: requireRole,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return { id: result.insertedId };
    }
  } catch (error) {
    throw new Error(`Error in createPermission (${this.type}): ${error.message}`);
  }
}

// Read a permission by ID
async getPermission(permissionId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.db.query(
        `SELECT id, item_id, require_action, require_role FROM permissions WHERE id = ?`,
        [permissionId]
      );
      if (rows.length === 0) throw new Error("Permission not found");
      return rows[0];
    } else if (this.type === "mongodb") {
      const permission = await this.db.collection("permissions").findOne({ _id: permissionId });
      if (!permission) throw new Error("Permission not found");
      return permission;
    }
  } catch (error) {
    throw new Error(`Error in getPermission (${this.type}): ${error.message}`);
  }
}

// Read all permissions (optional filter by item_id)
async getPermissions(itemId = null) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.db.query(
        `SELECT id, item_id, require_action, require_role FROM permissions WHERE item_id = ? OR ? IS NULL`,
        [itemId, itemId]
      );
      return rows;
    } else if (this.type === "mongodb") {
      const query = itemId ? { item_id: itemId } : {};
      const permissions = await this.db.collection("permissions").find(query).toArray();
      return permissions;
    }
  } catch (error) {
    throw new Error(`Error in getPermissions (${this.type}): ${error.message}`);
  }
}

// Update a permission
async updatePermission(permissionId, itemId, requireAction, requireRole = null) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `UPDATE permissions SET item_id = ?, require_action = ?, require_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [itemId, requireAction, requireRole, permissionId]
      );
      if (result.affectedRows === 0) throw new Error("Permission not found or no changes made");
      return { success: true };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("permissions").updateOne(
        { _id: permissionId },
        { $set: { item_id: itemId, require_action: requireAction, require_role: requireRole, updated_at: new Date() } }
      );
      if (result.matchedCount === 0) throw new Error("Permission not found or no changes made");
      return { success: true };
    }
  } catch (error) {
    throw new Error(`Error in updatePermission (${this.type}): ${error.message}`);
  }
}

// Delete a permission
async deletePermission(permissionId) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `DELETE FROM permissions WHERE id = ?`,
        [permissionId]
      );
      if (result.affectedRows === 0) throw new Error("Permission not found");
      return { success: true };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("permissions").deleteOne({ _id: permissionId });
      if (result.deletedCount === 0) throw new Error("Permission not found");
      return { success: true };
    }
  } catch (error) {
    throw new Error(`Error in deletePermission (${this.type}): ${error.message}`);
  }
}

//---- User Permission Scope ----

// Create a new user permission (add access for a user to a document/route)
async createUserPermission(userId, onDoc, permission) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `INSERT INTO user_permissions (user_id, onDoc, permission) VALUES (?, ?, ?)`,
        [userId, onDoc, permission]
      );
      return { id: result.insertId };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("user_permissions").insertOne({
        user_id: userId,
        onDoc,
        permission,
        created_at: new Date(),
        updated_at: new Date(),
      });
      return { id: result.insertedId };
    }
  } catch (error) {
    throw new Error(`Error in createUserPermission (${this.type}): ${error.message}`);
  }
}

// Read a user permission by ID
async getUserPermission(permissionId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.db.query(
        `SELECT id, user_id, onDoc, permission FROM user_permissions WHERE id = ?`,
        [permissionId]
      );
      if (rows.length === 0) throw new Error("User permission not found");
      return rows[0];
    } else if (this.type === "mongodb") {
      const permission = await this.db.collection("user_permissions").findOne({ _id: permissionId });
      if (!permission) throw new Error("User permission not found");
      return permission;
    }
  } catch (error) {
    throw new Error(`Error in getUserPermission (${this.type}): ${error.message}`);
  }
}

// Read all permissions for a specific user (optional filter by onDoc)
async getUserPermissions(userId, onDoc = null) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.db.query(
        `SELECT id, user_id, onDoc, permission 
         FROM user_permissions 
         WHERE user_id = ? AND (onDoc = ? OR ? IS NULL)`,
        [userId, onDoc, onDoc]
      );
      return rows;
    } else if (this.type === "mongodb") {
      const query = { user_id: userId };
      if (onDoc) query.onDoc = onDoc;
      const permissions = await this.db.collection("user_permissions").find(query).toArray();
      return permissions;
    }
  } catch (error) {
    throw new Error(`Error in getUserPermissions (${this.type}): ${error.message}`);
  }
}

// Update a user permission
async updateUserPermission(permissionId, onDoc, permission) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `UPDATE user_permissions 
         SET onDoc = ?, permission = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [onDoc, permission, permissionId]
      );
      if (result.affectedRows === 0) throw new Error("User permission not found or no changes made");
      return { success: true };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("user_permissions").updateOne(
        { _id: permissionId },
        { $set: { onDoc, permission, updated_at: new Date() } }
      );
      if (result.matchedCount === 0) throw new Error("User permission not found or no changes made");
      return { success: true };
    }
  } catch (error) {
    throw new Error(`Error in updateUserPermission (${this.type}): ${error.message}`);
  }
}

// Delete a user permission
async deleteUserPermission(permissionId) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.db.query(
        `DELETE FROM user_permissions WHERE id = ?`,
        [permissionId]
      );
      if (result.affectedRows === 0) throw new Error("User permission not found");
      return { success: true };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection("user_permissions").deleteOne({ _id: permissionId });
      if (result.deletedCount === 0) throw new Error("User permission not found");
      return { success: true };
    }
  } catch (error) {
    throw new Error(`Error in deleteUserPermission (${this.type}): ${error.message}`);
  }
}

// Check if a user has a specific permission for a document/route
async checkUserPermission(userId, onDoc, requiredPermission) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.db.query(
        `SELECT permission 
         FROM user_permissions 
         WHERE user_id = ? AND onDoc = ? AND permission = ?`,
        [userId, onDoc, requiredPermission]
      );
      return rows.length > 0;
    } else if (this.type === "mongodb") {
      const permission = await this.db.collection("user_permissions").findOne({
        user_id: userId,
        onDoc,
        permission: requiredPermission,
      });
      return !!permission;
    }
  } catch (error) {
    throw new Error(`Error in checkUserPermission (${this.type}): ${error.message}`);
  }
}

//----- TEAM SCOPE -----

// Team CRUD
async createTeam({ name, styling, creatorId }) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.client.execute(
        "INSERT INTO teams (name, styling) VALUES (?, ?)",
        [name, styling]
      );
      return { id: result.insertId, name, styling, labels: [] };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('teams').insertOne({
        name,
        styling,
        labels: [],
        created_at: new Date(),
        updated_at: new Date(),
      });
      return { id: result.insertedId, name, styling, labels: [] };
    }
  } catch (error) {
    throw new Error(`Error in createTeam (${this.type}): ${error.message}`);
  }
}

async getTeam(teamId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute(
        `
        SELECT 
          t.id, t.name, t.styling, t.creator_id, t.labels AS team_labels,
          tu.user_id, tu.role, tu.labels AS user_labels 
        FROM teams t 
        LEFT JOIN team_users tu ON t.id = tu.team_id 
        WHERE t.id = ?
        `,
        [teamId]
      );

      if (!rows.length) {
        return null; // Ha a csapat nem létezik
      }

      const team = {
        id: rows[0].id,
        name: rows[0].name,
        styling: rows[0].styling,
        creator_id: rows[0].creator_id,
        labels: rows[0].team_labels ? JSON.parse(rows[0].team_labels) : [],
        users: [],
      };

      rows.forEach((row) => {
        if (row.user_id) {
          team.users.push({
            user_id: row.user_id,
            role: row.role,
            labels: row.user_labels ? JSON.parse(row.user_labels) : [],
          });
        }
      });

      return team;
    } else if (this.type === "mongodb") {
      const team = await this.db
        .collection("teams")
        .findOne({ _id: this.toObjectId(teamId) });

      console.log("team", team); // Hibakeresés

      if (!team) {
        return null; // Ha a csapat nem létezik
      }

      const teamMembers = await this.db
        .collection("team_users")
        .find({ team_id: teamId })
        .toArray();

      return {
        id: team._id.toString(),
        name: team.name,
        styling: team.styling || "{}",
        creator_id: team.creator_id || "",
        labels: team.labels || [],
        users: teamMembers.map((member) => ({
          user_id: member.user_id,
          role: member.role,
          labels: member.labels || [],
        })),
      };
    }
  } catch (error) {
    throw new Error(`Error in getTeam (${this.type}): ${error.message}`);
  }
}

async getTeams(userId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute(
        `
        SELECT 
          t.id, t.name, t.styling, t.creator_id, t.labels AS team_labels,
          tu.user_id, tu.role, tu.labels AS user_labels 
        FROM teams t 
        JOIN team_users tu ON t.id = tu.team_id 
        WHERE tu.user_id = ?
        `,
        [userId]
      );

      const teamsMap = {};

      rows.forEach((row) => {
        const teamId = row.id;
        if (!teamsMap[teamId]) {
          teamsMap[teamId] = {
            id: row.id,
            name: row.name,
            styling: row.styling,
            creator_id: row.creator_id,
            labels: row.team_labels ? JSON.parse(row.team_labels) : [],
            users: [],
          };
        }
        teamsMap[teamId].users.push({
          user_id: row.user_id,
          role: row.role,
          labels: row.user_labels ? JSON.parse(row.user_labels) : [],
        });
      });

      return { teams: Object.values(teamsMap) };
    } else if (this.type === "mongodb") {
      console.log("userId", userId);
      // Lekérjük a team_id-kat, ahol a felhasználó tag
      const teamIds = await this.db
        .collection("team_users")
        .distinct("team_id", { user_id: userId });

      console.log("teamIds", teamIds); // Hibakeresés

      if (!teamIds || teamIds.length === 0) {
        return { teams: [] };
      }

      // Ellenőrizzük, hogy a teamIds elemei stringek legyenek
      const validTeamIds = teamIds
        .filter((id) => id && typeof id === "string")
        .map((id) => this.toObjectId(id));

      if (validTeamIds.length === 0) {
        console.log("No valid teamIds found");
        return { teams: [] };
      }

      // Csapatok lekérdezése
      const teams = await this.db
        .collection("teams")
        .find({ _id: { $in: validTeamIds } })
        .toArray();

      console.log("teams", teams); // Hibakeresés

      if (!teams || teams.length === 0) {
        return { teams: [] };
      }

      // Csapattagok lekérdezése
      const teamMembers = await this.db
        .collection("team_users")
        .find({ team_id: { $in: teamIds } })
        .toArray();

      console.log("teamMembers", teamMembers); // Hibakeresés

      const teamsMap = {};

      teams.forEach((team) => {
        // Ellenőrizzük, hogy a team és _id létezik
        if (team && team._id) {
          const teamId = team._id.toString();
          teamsMap[teamId] = {
            id: teamId,
            name: team.name || "",
            styling: team.styling || "{}",
            creator_id: team.creator_id || "",
            labels: team.labels || [],
            users: [],
          };
        }
      });

      teamMembers.forEach((member) => {
        // Ellenőrizzük, hogy a member és team_id létezik
        if (member && member.team_id) {
          const teamId = member.team_id.toString();
          if (teamsMap[teamId]) {
            teamsMap[teamId].users.push({
              user_id: member.user_id || "",
              role: member.role || "",
              labels: member.labels || [],
            });
          }
        }
      });

      return { teams: Object.values(teamsMap) };
    }
  } catch (error) {
    throw new Error(`Error in getTeams (${this.type}): ${error.message}`);
  }
}

async updateTeam(teamId, name, styling, userId) {
  try {
    if (this.type === "mysql") {
      await this.client.execute(
        "UPDATE teams SET name = ?, styling = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [name, styling, teamId]
      );
      return { id: teamId, name, styling };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('teams').findOneAndUpdate(
        { _id: this.toObjectId(teamId) },
        { $set: { name, styling, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      return result.value;
    }
  } catch (error) {
    throw new Error(`Error in updateTeam (${this.type}): ${error.message}`);
  }
}

async deleteTeam(teamId, userId) {
  try {
    if (this.type === "mysql") {
      await this.client.execute("DELETE FROM teams WHERE id = ?", [teamId]);
      return { id: teamId };
    } else if (this.type === "mongodb") {
      await this.db.collection('teams').deleteOne({ _id: this.toObjectId(teamId) });
      return { id: teamId };
    }
  } catch (error) {
    throw new Error(`Error in deleteTeam (${this.type}): ${error.message}`);
  }
}

// Team Users CRUD
async addTeamUser(teamId, userId, role, addedBy) {
  try {
    if (this.type === "mysql") {
      const [result] = await this.client.execute(
        "INSERT INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)",
        [teamId, userId, role]
      );
      return { id: result.insertId, team_id: teamId, user_id: userId, role };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('team_users').insertOne({
        team_id: teamId,
        user_id: userId,
        role,
        labels: [],
        created_at: new Date(),
        updated_at: new Date(),
      });
      return { _id: result.insertedId, team_id: teamId, user_id: userId, role };
    }
  } catch (error) {
    throw new Error(`Error in addTeamUser (${this.type}): ${error.message}`);
  }
}

async removeTeamUser(teamId, userId, removedBy) {
  try {
    if (this.type === "mysql") {
      await this.client.execute("DELETE FROM team_users WHERE team_id = ? AND user_id = ?", [teamId, userId]);
      return { team_id: teamId, user_id: userId };
    } else if (this.type === "mongodb") {
      await this.db.collection('team_users').deleteOne({ team_id: teamId, user_id: userId });
      return { team_id: teamId, user_id: userId };
    }
  } catch (error) {
    throw new Error(`Error in removeTeamUser (${this.type}): ${error.message}`);
  }
}

async updateTeamUserRole(teamId, userId, role, updatedBy) {
  try {
    if (this.type === "mysql") {
      await this.client.execute(
        "UPDATE team_users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id = ? AND user_id = ?",
        [role, teamId, userId]
      );
      return { team_id: teamId, user_id: userId, role };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('team_users').findOneAndUpdate(
        { team_id: teamId, user_id: userId },
        { $set: { role, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      return { team_id: teamId, user_id: userId, role };
    }
  } catch (error) {
    throw new Error(`Error in updateTeamUserRole (${this.type}): ${error.message}`);
  }
}

async updateTeamUserLabels(teamId, userId, labels, updatedBy) {
  try {
    if (this.type === "mysql") {
      await this.client.execute(
        "UPDATE team_users SET labels = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id = ? AND user_id = ?",
        [JSON.stringify(labels), teamId, userId]
      );
      return { team_id: teamId, user_id: userId, labels };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('team_users').findOneAndUpdate(
        { team_id: teamId, user_id: userId },
        { $set: { labels, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      return { team_id: teamId, user_id: userId, labels };
    }
  } catch (error) {
    throw new Error(`Error in updateTeamUserLabels (${this.type}): ${error.message}`);
  }
}

async getTeamUserRole(teamId, userId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute(
        "SELECT role FROM team_users WHERE team_id = ? AND user_id = ?",
        [teamId, userId]
      );
      return rows[0]?.role;
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('team_users').findOne(
        { team_id: teamId, user_id: userId },
        { projection: { role: 1 } }
      );
      return result?.role;
    }
  } catch (error) {
    throw new Error(`Error in getTeamUserRole (${this.type}): ${error.message}`);
  }
}

async listTeams() {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute("SELECT * FROM teams");
      return rows;
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('teams').find().toArray();
      return result;
    }
  } catch (error) {
    throw new Error(`Error in listTeams (${this.type}): ${error.message}`);
  }
}
//---- labels and preferences ----
  //---- Labels and Preferences ----

// Labels CRUD Methods

// Set (Replace) the entire labels array for a user
async setUserLabels(userId, labels) {
  try {
    if (this.type === "mysql") {
      await this.client.execute(
        "UPDATE users SET labels = ? WHERE id = ?",
        [JSON.stringify(labels), userId]
      );
      return { user_id: userId, labels };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('users').findOneAndUpdate(
        { _id: this.toObjectId(userId) },
        { $set: { labels, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) throw new Error("User not found");
      return { user_id: userId, labels };
    }
  } catch (error) {
    throw new Error(`Error in setUserLabels (${this.type}): ${error.message}`);
  }
}

// Retrieve the labels array for a user
async getUserLabels(userId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute(
        "SELECT labels FROM users WHERE id = ?",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return rows[0].labels ? JSON.parse(rows[0].labels) : [];
    } else if (this.type === "mongodb") {
      const user = await this.db.collection('users').findOne(
        { _id: this.toObjectId(userId) },
        { projection: { labels: 1 } }
      );
      if (!user) throw new Error("User not found");
      return user.labels || [];
    }
  } catch (error) {
    throw new Error(`Error in getUserLabels (${this.type}): ${error.message}`);
  }
}

// Delete the entire labels array for a user (set to empty array)
async deleteUserLabels(userId) {
  try {
    if (this.type === "mysql") {
      await this.client.execute(
        "UPDATE users SET labels = ? WHERE id = ?",
        [JSON.stringify([]), userId]
      );
      return { user_id: userId, labels: [] };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('users').findOneAndUpdate(
        { _id: this.toObjectId(userId) },
        { $set: { labels: [], updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) throw new Error("User not found");
      return { user_id: userId, labels: [] };
    }
  } catch (error) {
    throw new Error(`Error in deleteUserLabels (${this.type}): ${error.message}`);
  }
}

// Preferences CRUD Methods

// Update or add a specific key-value pair in the preferences object
async updateUserPreference(userId, key, value) {
  try {
    if (this.type === "mysql") {
      // First, get the current preferences
      const [rows] = await this.client.execute(
        "SELECT preferences FROM users WHERE id = ?",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");

      // Parse the current preferences (or initialize as empty object)
      const currentPrefs = rows[0].preferences ? JSON.parse(rows[0].preferences) : {};
      
      // Update the specific key with the new value
      currentPrefs[key] = value;

      // Save the updated preferences
      await this.client.execute(
        "UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(currentPrefs), userId]
      );
      return { user_id: userId, preferences: currentPrefs };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('users').findOneAndUpdate(
        { _id: this.toObjectId(userId) },
        { $set: { [`preferences.${key}`]: value, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) throw new Error("User not found");
      return { user_id: userId, preferences: result.value.preferences || {} };
    }
  } catch (error) {
    throw new Error(`Error in updateUserPreference (${this.type}): ${error.message}`);
  }
}

// Delete a specific key from the preferences object
async deleteUserPreferenceKey(userId, key) {
  try {
    if (this.type === "mysql") {
      // First, get the current preferences
      const [rows] = await this.client.execute(
        "SELECT preferences FROM users WHERE id = ?",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");

      // Parse the current preferences (or initialize as empty object)
      const currentPrefs = rows[0].preferences ? JSON.parse(rows[0].preferences) : {};

      // Remove the specific key
      if (key in currentPrefs) {
        delete currentPrefs[key];
      }

      // Save the updated preferences
      await this.client.execute(
        "UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(currentPrefs), userId]
      );
      return { user_id: userId, preferences: currentPrefs };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('users').findOneAndUpdate(
        { _id: this.toObjectId(userId) },
        { $unset: { [`preferences.${key}`]: "" }, $set: { updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) throw new Error("User not found");
      return { user_id: userId, preferences: result.value.preferences || {} };
    }
  } catch (error) {
    throw new Error(`Error in deleteUserPreferenceKey (${this.type}): ${error.message}`);
  }
}

// Retrieve the entire preferences object for a user
async getUserPreferences(userId) {
  try {
    if (this.type === "mysql") {
      const [rows] = await this.client.execute(
        "SELECT preferences FROM users WHERE id = ?",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");
      return rows[0].preferences ? JSON.parse(rows[0].preferences) : {};
    } else if (this.type === "mongodb") {
      const user = await this.db.collection('users').findOne(
        { _id: this.toObjectId(userId) },
        { projection: { preferences: 1 } }
      );
      if (!user) throw new Error("User not found");
      return user.preferences || {};
    }
  } catch (error) {
    throw new Error(`Error in getUserPreferences (${this.type}): ${error.message}`);
  }
}

// Set a new key-value pair in the preferences object (explicitly for adding new pairs)
async setUserPreference(userId, key, value) {
  try {
    if (this.type === "mysql") {
      // First, get the current preferences
      const [rows] = await this.client.execute(
        "SELECT preferences FROM users WHERE id = ?",
        [userId]
      );
      if (rows.length === 0) throw new Error("User not found");

      // Parse the current preferences (or initialize as empty object)
      const currentPrefs = rows[0].preferences ? JSON.parse(rows[0].preferences) : {};

      // Add the new key-value pair (if the key already exists, it will be updated)
      currentPrefs[key] = value;

      // Save the updated preferences
      await this.client.execute(
        "UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(currentPrefs), userId]
      );
      return { user_id: userId, preferences: currentPrefs };
    } else if (this.type === "mongodb") {
      const result = await this.db.collection('users').findOneAndUpdate(
        { _id: this.toObjectId(userId) },
        { $set: { [`preferences.${key}`]: value, updated_at: new Date() } },
        { returnDocument: 'after' }
      );
      if (!result.value) throw new Error("User not found");
      return { user_id: userId, preferences: result.value.preferences || {} };
    }
  } catch (error) {
    throw new Error(`Error in setUserPreference (${this.type}): ${error.message}`);
  }
}

// ---- EXECUTION ----

  // execute metódus a meglévő lekérdezésekhez (opcionális)
  async execute(query) {
    if (this.type === "mongodb") {
      const result = await this.db.query;
      return { result };
    } else if (this.type === "mysql") {
      const [rows] = await this.db.query(query);
      return { result: rows };
    }
  }


}

class MongoDB extends Database {
  constructor(connectionInfo) {
    super("mongodb", connectionInfo); // Explicit type átadása
    this.client = null;
    this.db = null;
    this.lastTimestamp = null;
  }

  async connect(connectionInfo) {
    this.client = new MongoClient(connectionInfo.url);
    await this.client.connect();
    this.db = this.client.db(connectionInfo.dbName || "mydb");
    console.log("Connected to MongoDB");
  }

  async execute(code) {
    try {
      let modifiedCode = code;
      const idMatch = code.match(/_id:\s*"([^"]+)"/);
      if (idMatch && idMatch[1]) {
        const idValue = idMatch[1];
        console.log(`Received _id from frontend: "${idValue}"`);
        if (typeof idValue === "string" && idValue.length === 24) {
          // Szövegesen illesztjük be az ObjectId konstruktor hívást
          modifiedCode = code.replace(
            `_id: "${idValue}"`,
            `_id: new ObjectId("${idValue}")`
          );
        }
      }
      console.log(`Executing modified code: ${modifiedCode}`);

      // Eval helyett függvényt használunk, amely megkapja az ObjectId-t és a db-t
      const executeFn = new Function(
        "ObjectId",
        "db",
        `
          return (async () => { return await db.${modifiedCode}; })();
        `
      );
      const result = await executeFn(ObjectId, this.db);
      return { status: "success", result };
    } catch (err) {
      console.error(`Execution error: ${err.message}`);
      return {
        status: "error",
        error: `MongoDB execution error: ${err.message}`,
      };
    }
  }

  async close() {
    await this.client.close();
    console.log("MongoDB connection closed");
  }
}

class MySQLDB extends Database {
  constructor(connectionInfo) {
    super("mysql", connectionInfo);
    this.db = null;
    this.lastTimestamp = null;
  }

  async connect(connectionInfo) {
    this.db = await mysql.createConnection({
      host: connectionInfo.host || "localhost",
      user: connectionInfo.user,
      port: connectionInfo.port || 3306,
      password: connectionInfo.password || "",
      database: connectionInfo.database,
    });
    this.db.connect(err => {
      if (err) {
          console.log('Database connection error:', err);
          process.exit(1);
      }
      console.log('Connected to the database');
  });
  
    console.log("Connected to MySQL");
    //create sessions, teams, permission and users table if not exist
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) DEFAULT '',
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        labels JSON DEFAULT '[]',
        preferences JSON DEFAULT '{}',
        verified BOOLEAN DEFAULT FALSE,
        isSuper BOOLEAN DEFAULT FALSE
      )
    `);
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        onDoc VARCHAR(255) NOT NULL,
        permission VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) 
    `);
    await this.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      styling JSON DEFAULT '{"color": "#000000", "icon": ""}',
      labels JSON DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
    `);
    await this.execute(`
    CREATE TABLE IF NOT EXISTS team_users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      team_id INT NOT NULL,
      user_id INT NOT NULL,
      role VARCHAR(50) NOT NULL,
      labels JSON DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    `);
    await this.execute(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id VARCHAR(255) NOT NULL,
        require_action VARCHAR(255) NOT NULL,
        require_role VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await this.db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      subscription JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
      }


  async watchChanges(tableName, callback, options = {}) {
    const { pollInterval = 1000 } = options;
    this.lastTimestamp = Math.floor(Date.now() / 1000);
    console.log(
      `[MySQL] Starting polling for ${tableName} with interval ${pollInterval}ms`
    );

    const pollChanges = async () => {
      try {
        console.log(
          `[MySQL] Polling ${tableName}, checking changes since ${this.lastTimestamp}`
        );
        const [rows] = await this.db.execute(
          `SELECT * FROM ${tableName} WHERE updated_at > FROM_UNIXTIME(?) ORDER BY updated_at DESC`,
          [this.lastTimestamp]
        );
        if (rows.length > 0) {
          this.lastTimestamp = Math.floor(Date.now() / 1000);
          console.log(`[MySQL] Change detected in ${tableName}:`, rows);
          callback(rows);
        } else {
          console.log(
            `[MySQL] No changes detected in ${tableName} during polling`
          );
        }
      } catch (err) {
        console.error(`[MySQL] Polling error in ${tableName}:`, err);
      }
    };

    await pollChanges();
    const interval = setInterval(pollChanges, pollInterval);
    console.log(`[MySQL] Polling interval set for ${tableName}`);

    return {
      close: () => {
        console.log(`[MySQL] Stopping polling for ${tableName}`);
        clearInterval(interval);
      },
    };
  }

  async execute(method) {
    try {
      const [rows] = await this.db.execute(method);
      return { status: "success", result: rows };
    } catch (err) {
      return {
        status: "error",
        error: `MySQL execution error: ${err.message}`,
      };
    }
  }

  async close() {
    await this.db.end();
    console.log("MySQL connection closed");
  }
}

export { Database, MongoDB, MySQLDB };
