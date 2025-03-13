// utils/socket.ts
import { io, Socket } from "socket.io-client";
import bcrypt from "bcryptjs";

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

interface ConnectionInfo {
  url?: string;
  dbName?: string;
  user?: string;
  password?: string;
  host?: string;
  database?: string;
  port?: number;
}

interface ActionBuilder {
  query(queryCode: string): ActionBuilder;
  setState(setter: React.Dispatch<React.SetStateAction<any[]>>): ActionBuilder;
  callback(fn: (data: any) => void): ActionBuilder;
  execute(): void; // Explicit execute a lánc végén
}

interface ListenOptions {
  usePolling?: boolean;
  pollInterval?: number;
}

export class Client {
  private socket: Socket;
  private dbType: string | null = null;
  private connectionInfo: ConnectionInfo | null = null;
  public publicVapidKey: string;
  private isInitialized = false;
  private initializePromise: Promise<void> | null = null;

  constructor(url: string = "https://52ee-2a02-ab88-6787-1c80-ad15-e8c9-606e-3d76.ngrok-free.app") {
    this.socket = io(url);
    this.publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC!;
    if (!this.publicVapidKey) {
      throw new Error("Public Vapid Key is not set");
    }
  }

  token() {
    return localStorage.getItem("t_auth");
  }

  urlBase64ToUint8Array(base64String: string) {
    console.log("Converting base64 to Uint8Array...", base64String);
    if (!base64String) throw new Error('Invalid base64 string');
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  public database(type: "mongodb" | "mysql"): Client {
    this.dbType = type;
    return this;
  }

  public connection(connectionInfo: any): Promise<this> {
    this.connectionInfo = connectionInfo;
  
    return new Promise((resolve, reject) => {
      if (!this.dbType || !this.connectionInfo) {
        reject(new Error("Database type and connection info must be provided."));
        return;
      }
      this.socket.emit("initialize", {
        dbType: this.dbType,
        connectionInfo: this.connectionInfo,
      });
      this.socket.once("initialized", () => {
        console.log("Socket initialized");
        this.isInitialized = true;
        resolve(this);
      });
      this.socket.once("error", (error: any) => {
        this.isInitialized = false;
        reject(new Error(error.message));
      });
    });
  }

  private initialize() {
    if (!this.dbType || !this.connectionInfo) {
      throw new Error("Database type and connection info must be provided.");
    }
    this.socket.emit("initialize", {
      dbType: this.dbType,
      connectionInfo: this.connectionInfo,
    });
  }

  private initializeAsync(): Promise<void> {
    // Ha már inicializálva van, vagy folyamatban van az inicializálás, várjuk meg
    if (this.isInitialized) {
      return Promise.resolve();
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }

    if (!this.dbType || !this.connectionInfo) {
      return Promise.reject(new Error("Database type and connection info must be provided."));
    }

    // Új Promise létrehozása az inicializáláshoz
    this.initializePromise = new Promise((resolve, reject) => {
      this.socket.emit("initialize", {
        dbType: this.dbType,
        connectionInfo: this.connectionInfo,
      });

      this.socket.once("initialized", () => {
        console.log("Socket initialized");
        this.isInitialized = true;
        resolve();
      });

      // Hibakezelés, ha az inicializálás sikertelen
      this.socket.once("error", (error: any) => {
        this.isInitialized = false;
        this.initializePromise = null; // Reseteljük, hogy újra próbálkozhassunk
        reject(new Error(error.message));
      });
    });

    return this.initializePromise;
  }

  // Biztosítja, hogy az inicializálás megtörténjen, mielőtt bármilyen műveletet végrehajtunk
  private async ensureInitialized(): Promise<void> {
    if (this.connectionInfo) {
      await this.initializeAsync();
    }
  }

  private initializeNotification() {
    if (!this.dbType || !this.connectionInfo) {
      throw new Error("Database type and connection info must be provided.");
    }
    this.socket.emit("initializeNotification", {
      dbType: this.dbType,
      connectionInfo: this.connectionInfo,
    });
  }

  private closeConnection() {
    this.socket.emit("close");
  }

//------ SOCKET SCOPE ------

  public subscribe(channel: string, callback: (data: any) => void): Client {
    this.initialize();
    this.socket.emit("subscribe", channel);
    this.socket.on(channel, callback);
    return this;
  }

  public listen(channel: string, callback: (data: any) => void): Client {
    this.initialize();
    this.socket.emit("listen", channel);
    this.socket.on(channel, callback);
    return this;
  }

  public unsubscribe(channel: string): Client {
    this.socket.emit("unsubscribe", channel);
    this.socket.off(channel);
    return this;
  }

  public send(channel: string, data: any): Client {
    this.socket.emit("message", { channel, data });
    return this;
  }

//------ DATABASE SCOPE ------

  public execute(channel: string, query: string, callback: (data:any) => void): Client {
    this.socket.emit("action", { action: "execute", channel, code: query, method: "" });
    this.socket.on(`${channel}:result`, callback);
    return this;
  }

  private createActionBuilder(
    channel: string,
    method: "insert" | "delete" | "update" | "get",
    client: Client
  ): ActionBuilder {
    let code: string | undefined;
    let setState: React.Dispatch<React.SetStateAction<any[]>> | undefined;
    let callback: ((data: any) => void) | undefined;
  
    const closeConnection = () => {
      client.socket.emit("close");
      console.log("Socket connection closed");
    };
  
    const builder: ActionBuilder = {
      query(queryCode: string): ActionBuilder {
        code = queryCode;
        console.log("Query set:", queryCode);
        return this;
      },
      setState(setter: React.Dispatch<React.SetStateAction<any[]>>): ActionBuilder {
        setState = setter;
        console.log("setState set");
        return this;
      },
      callback(fn: (data: any) => void): ActionBuilder {
        callback = fn;
        console.log("Callback set");
        return this;
      },
      execute(): void {
        if (!code) {
          console.error("Query code is required but not provided");
          return;
        }
        client.initialize();
        console.log("Action executed:", { channel, method, code });
        client.socket.emit("action", {
          action: "execute",
          channel,
          method,
          code,
        });
  
        if (setState || callback) {
          client.socket.once(`${channel}:result`, (response) => {
            console.log(`${method} response:`, response);
            if (response.status === "success") {
              const res = response.result;
              if (setState) {
                switch (method) {
                  case "insert":
                    if (res.insertedId) {
                      const newItem = { _id: res.insertedId, ...res.insertedDoc };
                      setState((prev) => [...prev, newItem]);
                    }
                    break;
                    case "delete":
                      if (res.deletedCount > 0 || res.affectedRows > 0) {
                        const idMatch = res.id;
                        console.log("Deleting item with ID:", idMatch);
                        if (idMatch) {
                          setState((prev) => {
                            const newState = prev.filter(
                              (item) => item._id !== idMatch && item.id != idMatch
                            );
                            console.log(prev.filter((item) => item._id !== idMatch && item.id != idMatch));
                            console.log("New state after delete:", newState);
                            return newState;
                          });
                        }
                      }
                      break;
                  case "update":
                    if (res.updatedId && res.updatedDoc) {
                      console.log("Updating item with ID:", res.updatedId);
                      setState((prev) => {
                        const newState = prev.map((item) =>
                          item._id === res.updatedId || item.id == res.updatedId
                            ? { ...item, ...res.updatedDoc }
                            : item
                        );
                        console.log("New state after update:", newState);
                        return newState;
                      });
                    }
                    break;
                  case "get":
                    console.log("Setting state with get result:", res);
                    setState(res || []);
                    break;
                }
              }
              if (callback) callback(response);
            } else {
              console.error(`${method} failed:`, response.message);
              if (callback) callback(response);
            }
          });
        }
      },
    };
    return builder;
  }

  public get(channel: string): ActionBuilder {
    return this.createActionBuilder(channel, "get", this);
  }

  public delete(channel: string): ActionBuilder {
    return this.createActionBuilder(channel, "delete", this);
  }

  public update(channel: string): ActionBuilder {
    return this.createActionBuilder(channel, "update", this);
  }

  public add(channel: string): ActionBuilder {
    console.log("Creating action builder for", channel);
    return this.createActionBuilder(channel, "insert", this);
  }

//------ NOTIFICATIONS SCOPE ------
  public async subscribeToNotification(userId: string) {
    if(this.connectionInfo) {
      this.initializeNotification();
    }
    if (!userId) {
      console.log('Error: User ID is required');
      throw new Error('User ID is required');
    };
  
    // Service Worker ellenőrzése
    if (!('serviceWorker' in navigator)) {
      console.log('Error: ServiceWorker is not supported in this environment');
      throw new Error('ServiceWorker is not supported in this environment');
    }
  
    // További ellenőrzés és logika
    if (!('PushManager' in window)) {
      console.log('Error: PushManager is not supported in this environment');
      throw new Error('PushManager is not supported in this environment');
    }
  
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Error: Notification permission denied');
        throw new Error('Notification permission denied');
      }
  
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered successfully');
  
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.publicVapidKey),
      });
  
      this.socket.emit('subscribe:not', { userId, subscription });
      console.log(`User ${userId} subscribed to push notifications`);
    } catch (error: any) {
      alert(`Subscription failed: ${error.message}`);
      throw error;
    }
  }

  public async unsubscribeFromNotification(userId: string): Promise<void> {
    if(this.connectionInfo) {
      this.initializeNotification();
    }
    if (!userId) throw new Error('User ID is required');

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
      this.socket.emit('unsubscribe:not', { userId, subscription });
      console.log(`User ${userId} unsubscribed from push notifications`);
    }
  }

  public sendNotification(userId: string, notificationBody: { title: string; message: string }): void {
    if(this.connectionInfo) {
      this.initializeNotification();
    }
    if (!notificationBody || typeof notificationBody !== 'object') {
      throw new Error('Notification body must be a valid object');
    }
    this.socket.emit('sendNotification', { userId, notification: notificationBody });
  }

  // ACCOUNT SCOPE
  public signUp(email: string, password: string, callback: (data: any) => void): Client {
    this.initialize();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const userData = { email, password: hashedPassword, createdAt: new Date() };

    this.socket.emit("account:action", {
      action: "signup",
      data: userData,
    });

    this.socket.on("account:result", (response) => {
      console.log("SignUp response:", response);
      if (response.status === "success" && response.token && response.sessionId) {
        document.cookie = `t_auth=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth", response.token);
      }
      callback(response);
    });

    return this;
  }

  public signIn(email: string, password: string, callback: (data: any) => void): Client {
    this.initialize();
    this.socket.emit("account:action", {
      action: "signin",
      data: { email, password },
    });
    this.socket.on("account:result", (response) => {
      console.log("SignIn response:", response);
      if (response.status === "success" && response.token && response.sessionId) {
        document.cookie = `t_auth_super=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth_super", response.token);
      }
      callback(response); // Hibák esetén is továbbítjuk a választ
    });
    return this;
  }

  public signUpSuper(email: string, password: string, callback: (data: any) => void): Client {
    this.initialize();
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    const userData = { email, password: hashedPassword, createdAt: new Date() };

    this.socket.emit("account:action", {
      action: "signupSuper",
      data: userData,
    });

    this.socket.on("account:result", (response) => {
      console.log("SignUp response:", response);
      if (response.status === "success" && response.token && response.sessionId) {
        document.cookie = `t_auth=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth", response.token);
        document.cookie = `t_auth_super=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth_super", response.token);
      }
      callback(response);
    });

    return this;
  }

  public signInSuper(email: string, password: string, callback: (data: any) => void): Client {
    this.initialize();
    this.socket.emit("account:action", {
      action: "signinSuper",
      data: { email, password },
    });
    this.socket.on("account:result", (response) => {
      console.log("SignIn response:", response);
      if (response.status === "success" && response.token && response.sessionId) {
        document.cookie = `t_auth=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth", response.token);
        document.cookie = `t_auth_super=${response.sessionId} ; path=/`;
        localStorage.setItem("t_auth_super", response.token);
      }
      callback(response); // Hibák esetén is továbbítjuk a választ
    });
    return this;
  }

  public validate(token: string, callback: (data: any) => void): Client {
    this.initialize();
    this.socket.emit("account:action", { action: "validate", token });
    this.socket.on("account:result", (response) => {
      console.log("Validate response:", response);
      callback(response);
    });
    return this;
  }

  public account(): {
    get: (callback: (data: any) => void) => Client;
    getSession: (callback: (data: any) => void) => Client;
    getSessions: (callback: (data: any) => void) => Client;
    setSession: (sessionData: string, callback: (data: any) => void) => Client;
    killSession: (callback: (data: any) => void) => Client;
    killSessions: (callback: (data: any) => void) => Client;
    changeSession: (newSessionString: string, callback: (data: any) => void) => Client;
    setLabels: (labels: string[], callback: (data: any) => void) => Client;
    getLabels: (callback: (data: any) => void) => Client;
    deleteLabels: (callback: (data: any) => void) => Client;
    setPreference: (key: string, value: any, callback: (data: any) => void) => Client;
    updatePreference: (key: string, value: any, callback: (data: any) => void) => Client;
    deletePreferenceKey: (key: string, callback: (data: any) => void) => Client;
    getPreferences: (callback: (data: any) => void) => Client;
  } {
    this.initialize();
  
    function getCookie(cname: string) {
      let name = cname + "=";
      let decodedCookie = decodeURIComponent(document.cookie);
      let ca = decodedCookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
          c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
          return c.substring(name.length, c.length);
        }
      }
      return "";
    }
  
    return {
      get: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("account:action", { action: "getAccount", token });
        this.socket.on("account:get", (response) => {
          console.log("Get account response:", response);
          callback(response);
        });
        return this;
      },
      getSession: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        const session = getCookie("t_auth");
        this.socket.emit("account:action", { action: "getSession", token, session });
        this.socket.on("account:session", (response) => {
          console.log("Get session response:", response);
          callback(response);
        });
        return this;
      },
      getSessions: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("account:action", { action: "getSessions", token });
        this.socket.on("account:session", (response) => {
          console.log("Get session response:", response);
          callback(response);
        });
        return this;
      },
      setSession: (sessionData: string, callback: (data: any) => void): Client => {
        const session = getCookie("t_auth");
        this.socket.emit("account:action", { action: "setSessions", session, data: sessionData });
        this.socket.on("account:result", (response) => {
          console.log("Set session response:", response);
          callback(response);
        });
        return this;
      },
      killSession: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        const session = getCookie("t_auth");
        this.socket.emit("account:action", { action: "killSession", token, session });
        this.socket.on("account:result", (response) => {
          console.log("Kill session response:", response);
          if (response.status === "success") {
            document.cookie = "t_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            localStorage.removeItem("t_auth");
          }
          callback(response);
        });
        return this;
      },
      killSessions: (callback: (data: any) => void): Client => {
        const session = getCookie("t_auth");
        this.socket.emit("account:action", { action: "killSessions", session });
        this.socket.on("account:result", (response) => {
          console.log("Kill session response:", response);
          if (response.status === "success") {
            document.cookie = "t_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            localStorage.removeItem("t_auth");
          }
          callback(response);
        });
        return this;
      },
      changeSession: (newSessionString: string, callback: (data: any) => void): Client => {
        const session = getCookie("t_auth");
        this.socket.emit("account:action", { action: "changeSession", session, data: newSessionString });
        this.socket.on("account:result", (response) => {
          console.log("Change session response:", response);
          callback(response);
        });
        return this;
      },
  
      // Labels Management
      setLabels: (labels: string[], callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("labels:action", { action: "setLabels", token, labels });
        this.socket.on("labels:result", (response) => {
          console.log("Set labels response:", response);
          callback(response);
        });
        return this;
      },
  
      getLabels: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("labels:action", { action: "getLabels", token });
        this.socket.on("labels:result", (response) => {
          console.log("Get labels response:", response);
          callback(response);
        });
        return this;
      },
  
      deleteLabels: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("labels:action", { action: "deleteLabels", token });
        this.socket.on("labels:result", (response) => {
          console.log("Delete labels response:", response);
          callback(response);
        });
        return this;
      },
  
      // Preferences Management
      setPreference: (key: string, value: any, callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("preferences:action", { action: "setPreference", token, key, value });
        this.socket.on("preferences:result", (response) => {
          console.log("Set preference response:", response);
          callback(response);
        });
        return this;
      },
  
      updatePreference: (key: string, value: any, callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("preferences:action", { action: "updatePreference", token, key, value });
        this.socket.on("preferences:result", (response) => {
          console.log("Update preference response:", response);
          callback(response);
        });
        return this;
      },
  
      deletePreferenceKey: (key: string, callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("preferences:action", { action: "deletePreferenceKey", token, key });
        this.socket.on("preferences:result", (response) => {
          console.log("Delete preference key response:", response);
          callback(response);
        });
        return this;
      },
  
      getPreferences: (callback: (data: any) => void): Client => {
        const token = localStorage.getItem("t_auth");
        this.socket.emit("preferences:action", { action: "getPreferences", token });
        this.socket.on("preferences:result", (response) => {
          console.log("Get preferences response:", response);
          callback(response);
        });
        return this;
      },
    };
  }

  public listenToAccountUpdates(callback: (data: any) => void): Client {
    this.socket.on("account:updates", (update) => {
      console.log("Account update received:", update);
      callback(update);
    });
    return this;
  }

//------ USERS SCOPE ------
public users(): {
  listAll: (callback: (data: any[]) => void) => Client;
  listOnline: (callback: (data: any[]) => void) => Client;
  listenOnlineUsers: (callback: (data: any[]) => void) => Client;
  getUser: (userId: string, callback: (data: any) => void) => Client;
  getUsers: (userIds: string[], callback: (data: any) => void) => Client;
  // Labels Management
  setLabels: (userId: string, labels: string[], callback: (data: any) => void) => Client;
  getLabels: (userId: string, callback: (data: any) => void) => Client;
  deleteLabels: (userId: string, callback: (data: any) => void) => Client;
  // Preferences Management
  setPreference: (userId: string, key: string, value: any, callback: (data: any) => void) => Client;
  updatePreference: (userId: string, key: string, value: any, callback: (data: any) => void) => Client;
  deletePreferenceKey: (userId: string, key: string, callback: (data: any) => void) => Client;
  getPreferences: (userId: string, callback: (data: any) => void) => Client;
} {
  this.initialize();
  return {
    listAll: (callback: (data: any[]) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("users:action", { action: "listAll", token });
      this.socket.on("users:result", (response) => {
        console.log("List all users response:", response);
        if (response.status === "success") {
          callback(response.data);
        } else {
          callback([]);
        }
      });
      return this;
    },
    listOnline: (callback: (data: any[]) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("users:action", { action: "listOnline", token });
      this.socket.on("users:online", (response) => {
        console.log("List online users response:", response);
        if (response.status === "success") {
          console.log("Online users:", response.data);
          callback(response.data);
        } else {
          callback([]);
        }
      });
      return this;
    },
    listenOnlineUsers: (callback: (data: any[]) => void): Client => {
      this.socket.emit("subscribe", "users:onlineChanged");
      this.socket.on("users:onlineChanged", (onlineUsersData) => {
        console.log("Online users changed:", onlineUsersData);
        callback(onlineUsersData);
      });
      return this;
    },
    getUser: (userId: string, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("users:action", { action: "getUser", token, userId });
      this.socket.on("users:get-user", (response) => {
        console.log("Get user response:", response);
        callback(response);
      });
      return this;
    },
    getUsers: (userIds: string[], callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("users:action", { action: "getUsers", token, userIds });
      this.socket.on("users:get-users", (response) => {
        console.log("Get users response:", response);
        callback(response);
      });
      return this;
    },

    // Labels Management
    setLabels: (userId: string, labels: string[], callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("labels:action", { action: "setLabels", token, userId, labels });
      this.socket.on("labels:result", (response) => {
        console.log("Set labels response:", response);
        callback(response);
      });
      return this;
    },

    getLabels: (userId: string, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("labels:action", { action: "getLabels", token, userId });
      this.socket.on("labels:result", (response) => {
        console.log("Get labels response:", response);
        callback(response);
      });
      return this;
    },

    deleteLabels: (userId: string, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("labels:action", { action: "deleteLabels", token, userId });
      this.socket.on("labels:result", (response) => {
        console.log("Delete labels response:", response);
        callback(response);
      });
      return this;
    },

    // Preferences Management
    setPreference: (userId: string, key: string, value: any, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("preferences:action", { action: "setPreference", token, userId, key, value });
      this.socket.on("preferences:result", (response) => {
        console.log("Set preference response:", response);
        callback(response);
      });
      return this;
    },

    updatePreference: (userId: string, key: string, value: any, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("preferences:action", { action: "updatePreference", token, userId, key, value });
      this.socket.on("preferences:result", (response) => {
        console.log("Update preference response:", response);
        callback(response);
      });
      return this;
    },

    deletePreferenceKey: (userId: string, key: string, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("preferences:action", { action: "deletePreferenceKey", token, userId, key });
      this.socket.on("preferences:result", (response) => {
        console.log("Delete preference key response:", response);
        callback(response);
      });
      return this;
    },

    getPreferences: (userId: string, callback: (data: any) => void): Client => {
      const token = localStorage.getItem("t_auth");
      this.socket.emit("preferences:action", { action: "getPreferences", token, userId });
      this.socket.on("preferences:result", (response) => {
        console.log("Get preferences response:", response);
        callback(response);
      });
      return this;
    },
  };
}

//------- BUCKET SCOPE -------
  public async createBucket(): Promise<string> {
    if (this.connectionInfo) {
      this.initialize();
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit('bucket:action', { action: 'create', token });

      this.socket.once('bucket:created', ({ bucketId }: { bucketId: string }) => {
        console.log(`Bucket created: ${bucketId}`);
        resolve(bucketId);
      });

      this.socket.once('error', ({ message }: { message: string }) => {
        console.log(`Error creating bucket: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async uploadFile(bucketId: string, file: { name: string; type: string; data: ArrayBuffer }): Promise<string> {
    if (this.connectionInfo) {
      this.initialize();
    }

    const token = localStorage.getItem("t_auth");
    
    if (!bucketId || !file || !file.name || !file.type || !file.data) {
      console.log('Uploading file to bucket:', bucketId, file);
      console.log('Error: Bucket ID and file details (name, type, data) are required');
      throw new Error('Bucket ID and file details are required');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('bucket:action', {action: 'upload', bucketId, file, token });

      this.socket.once('file:uploaded', ({ bucketId: returnedBucketId, fileId }: { bucketId: string; fileId: string }) => {
        console.log(`File uploaded to ${returnedBucketId}: ${fileId}`);
        resolve(fileId);
      });

      this.socket.once('error', ({ message }: { message: string }) => {
        console.log(`Error uploading file: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async getFile(bucketId: string, fileId: string): Promise<{ fileName: string; fileType: string; fileData: ArrayBuffer }> {
    if (this.connectionInfo) {
      this.initialize();
    }
    if (!bucketId || !fileId) {
      console.log('Error: Bucket ID and file ID are required');
      throw new Error('Bucket ID and file ID are required');
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit('bucket:action', {action: 'get', bucketId, fileId, token });

      this.socket.once('file:retrieved', (retrievedFile: { fileName: string; fileType: string; fileData: ArrayBuffer }) => {
        console.log(`File retrieved from ${bucketId}: ${retrievedFile.fileName}`);
        resolve(retrievedFile);
      });

      this.socket.once('error', ({ message }: { message: string }) => {
        console.log(`Error retrieving file: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async listFiles(bucketId: string): Promise<{ id: string; fileName: string; fileType: string; createdAt: string; updatedAt: string }[]> {
    if (this.connectionInfo) {
      this.initialize();
    }
    if (!bucketId) {
      console.log('Error: Bucket ID is required');
      throw new Error('Bucket ID is required');
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit('bucket:action', {action:'list', bucketId, token });

      this.socket.once('file:listed', ({ bucketId: returnedBucketId, files }: { bucketId: string; files: any[] }) => {
        console.log(`Listed ${files.length} files in ${returnedBucketId}`);
        resolve(files);
      });

      this.socket.once('error', ({ message }: { message: string }) => {
        console.log(`Error listing files: ${message}`);
        reject(new Error(message));
      });
    });
  }
  
  public async deleteFile(bucketId: string, fileId: string): Promise<void> {
    if (this.connectionInfo) {
      this.initialize();
    }
    if (!bucketId || !fileId) {
      console.log('Error: Bucket ID and file ID are required');
      throw new Error('Bucket ID and file ID are required');
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit('bucket:action', {action: 'deleteFile', bucketId, fileId, token});

      this.socket.once('file:delete', ({ bucketId: returnedBucketId, fileId: deletedFileId }: { bucketId: string; fileId: string }) => {
        console.log(`File ${deletedFileId} deleted from ${returnedBucketId}`);
        resolve();
      });

      this.socket.once('error', ({ message }: { message: string }) => {
        console.log(`Error deleting file: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async listBuckets(): Promise<string[]> {
    if (this.connectionInfo) {
      this.initialize();
    }
    
    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit("bucket:action", { action: "bucketList", token});

      this.socket.once("bucket:listed", ({ buckets }: { buckets: string[] }) => {
        console.log(`Listed ${buckets.length} buckets`);
        resolve(buckets);
      });

      this.socket.once("error", ({ message }: { message: string }) => {
        console.log(`Error listing buckets: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async deleteBucket(bucketId: string): Promise<void> {
    if (this.connectionInfo) {
      this.initialize();
    }
    if (!bucketId) {
      console.log("Error: Bucket ID is required");
      throw new Error("Bucket ID is required");
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit("bucket:action", {action: 'delete', bucketId, token });

      this.socket.once("bucket:deleted", ({ bucketId: deletedBucketId }: { bucketId: string }) => {
        console.log(`Bucket ${deletedBucketId} deleted`);
        resolve();
      });

      this.socket.once("error", ({ message }: { message: string }) => {
        console.log(`Error deleting bucket: ${message}`);
        reject(new Error(message));
      });
    });
  }

  public async renameBucket(oldBucketId: string, newBucketId: string): Promise<void> {
    if (this.connectionInfo) {
      this.initialize();
    }
    if (!oldBucketId || !newBucketId) {
      console.log("Error: Old and new bucket IDs are required");
      throw new Error("Old and new bucket IDs are required");
    }

    const token = localStorage.getItem("t_auth");

    return new Promise((resolve, reject) => {
      this.socket.emit("bucket:action", {action: 'rename', bucketId: oldBucketId, newBucketId, token });

      this.socket.once("bucket:renamed", ({ oldBucketId: oldId, newBucketId: newId }: { oldBucketId: string; newBucketId: string }) => {
        console.log(`Bucket renamed from ${oldId} to ${newId}`);
        resolve();
      });

      this.socket.once("error", ({ message }: { message: string }) => {
        console.log(`Error renaming bucket: ${message}`);
        reject(new Error(message));
      });
    });
  }

//------ PERMISSION SCOPE ------

  public async createPermission(itemId: string, requireAction: string, requireRole: string | null): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("permission", { action: "create", itemId, requireAction, requireRole });
      this.socket.once("permissionCreated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async getPermission(permissionId: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("permission", { action: "get", permissionId });
      this.socket.once("permission", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async getPermissions(itemId: string | null): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("permission", { action: "getAll", itemId });
      this.socket.once("permissions", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async updatePermission(permissionId: string, itemId: string, requireAction: string, requireRole: string | null): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("permission", { action: "update", permissionId, itemId, requireAction, requireRole });
      this.socket.once("permissionUpdated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async deletePermission(permissionId: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("permission", { action: "delete", permissionId });
      this.socket.once("permissionDeleted", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async createUserPermission(userId: string, onDoc: string, permission: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("userPermission", { action: "create", userId, onDoc, permission });
      this.socket.once("userPermissionCreated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async getUserPermissions(userId: string, onDoc: string | null): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("userPermission", { action: "getAll", userId, onDoc });
      this.socket.once("userPermissions", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async updateUserPermission(permissionId: string, onDoc: string, permission: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("userPermission", { action: "update", permissionId, onDoc, permission });
      this.socket.once("userPermissionUpdated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async deleteUserPermission(permissionId: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("userPermission", { action: "delete", permissionId });
      this.socket.once("userPermissionDeleted", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async checkUserPermission(userId: string, onDoc: string, requiredPermission: string): Promise<any> {
    if (this.connectionInfo) {
      this.initialize();
    }
    return new Promise((resolve, reject) => {
      this.socket.emit("userPermission", { action: "check", userId, onDoc, requiredPermission });
      this.socket.once("userPermissionCheck", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

//------ TEAMS SCOPE ------
  public async createTeam(name: string, styling: string, creatorId: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "create", name, styling, creatorId, token });
      this.socket.once("teamCreated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async getTeam(teamId: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "get", teamId, token });
      this.socket.once("team", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async getTeams(userId: string | null): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "getAll", userId, token });
      this.socket.once("teams", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async updateTeam(teamId: string, name: string, styling: string, userId: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "update", teamId, name, styling, userId, token });
      this.socket.once("teamUpdated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async deleteTeam(teamId: string, userId: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "delete", teamId, userId, token });
      this.socket.once("teamDeleted", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async addTeamUser(teamId: string, userId: string, role: string, addedBy: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "addUser", teamId, userId, role, addedBy, token });
      this.socket.once("teamUserAdded", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async removeTeamUser(teamId: string, userId: string, removedBy: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "removeUser", teamId, userId, removedBy, token });
      this.socket.once("teamUserRemoved", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async updateTeamUserRole(teamId: string, userId: string, role: string, updatedBy: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "updateUserRole", teamId, userId, role, updatedBy, token });
      this.socket.once("teamUserRoleUpdated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async updateTeamUserLabels(teamId: string, userId: string, labels: string[], updatedBy: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "updateUserLabels", teamId, userId, labels, updatedBy, token });
      this.socket.once("teamUserLabelsUpdated", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async leaveTeam(teamId: string, userId: string): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "leave", teamId, userId, token });
      this.socket.once("teamUserLeft", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public async listTeams(): Promise<any> {
    if (this.connectionInfo) this.initialize();
    const token = localStorage.getItem("t_auth");
    return new Promise((resolve, reject) => {
      this.socket.emit("teams", { action: "listAll", token });
      this.socket.once("teams", (data: any) => resolve(data));
      this.socket.once("error", (error: any) => reject(new Error(error.message)));
    });
  }

  public close(): void {
    this.socket.close();
  }
  
}


