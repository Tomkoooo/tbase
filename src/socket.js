"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// utils/socket.ts
import { io } from "socket.io-client";
import bcrypt from "bcryptjs";
export class Client {
    constructor(url = "https://52ee-2a02-ab88-6787-1c80-ad15-e8c9-606e-3d76.ngrok-free.app") {
        this.dbType = null;
        this.connectionInfo = null;
        this.isInitialized = false;
        this.initializePromise = null;
        this.socket = io(url);
        this.publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC;
        if (!this.publicVapidKey) {
            throw new Error("Public Vapid Key is not set");
        }
    }
    token() {
        return localStorage.getItem("t_auth");
    }
    urlBase64ToUint8Array(base64String) {
        console.log("Converting base64 to Uint8Array...", base64String);
        if (!base64String)
            throw new Error('Invalid base64 string');
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    database(type) {
        this.dbType = type;
        return this;
    }
    connection(connectionInfo) {
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
            this.socket.once("error", (error) => {
                this.isInitialized = false;
                reject(new Error(error.message));
            });
        });
    }
    initialize() {
        if (!this.dbType || !this.connectionInfo) {
            throw new Error("Database type and connection info must be provided.");
        }
        this.socket.emit("initialize", {
            dbType: this.dbType,
            connectionInfo: this.connectionInfo,
        });
    }
    initializeAsync() {
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
            this.socket.once("error", (error) => {
                this.isInitialized = false;
                this.initializePromise = null; // Reseteljük, hogy újra próbálkozhassunk
                reject(new Error(error.message));
            });
        });
        return this.initializePromise;
    }
    // Biztosítja, hogy az inicializálás megtörténjen, mielőtt bármilyen műveletet végrehajtunk
    ensureInitialized() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                yield this.initializeAsync();
            }
        });
    }
    initializeNotification() {
        if (!this.dbType || !this.connectionInfo) {
            throw new Error("Database type and connection info must be provided.");
        }
        this.socket.emit("initializeNotification", {
            dbType: this.dbType,
            connectionInfo: this.connectionInfo,
        });
    }
    closeConnection() {
        this.socket.emit("close");
    }
    //------ SOCKET SCOPE ------
    subscribe(channel, callback) {
        this.initialize();
        this.socket.emit("subscribe", channel);
        this.socket.on(channel, callback);
        return this;
    }
    listen(channel, callback) {
        this.initialize();
        this.socket.emit("listen", channel);
        this.socket.on(channel, callback);
        return this;
    }
    unsubscribe(channel) {
        this.socket.emit("unsubscribe", channel);
        this.socket.off(channel);
        return this;
    }
    send(channel, data) {
        this.socket.emit("message", { channel, data });
        return this;
    }
    //------ DATABASE SCOPE ------
    execute(channel, query, callback) {
        this.socket.emit("action", { action: "execute", channel, code: query, method: "" });
        this.socket.on(`${channel}:result`, callback);
        return this;
    }
    createActionBuilder(channel, method, client) {
        let code;
        let setState;
        let callback;
        const closeConnection = () => {
            client.socket.emit("close");
            console.log("Socket connection closed");
        };
        const builder = {
            query(queryCode) {
                code = queryCode;
                console.log("Query set:", queryCode);
                return this;
            },
            setState(setter) {
                setState = setter;
                console.log("setState set");
                return this;
            },
            callback(fn) {
                callback = fn;
                console.log("Callback set");
                return this;
            },
            execute() {
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
                                            const newItem = Object.assign({ _id: res.insertedId }, res.insertedDoc);
                                            setState((prev) => [...prev, newItem]);
                                        }
                                        break;
                                    case "delete":
                                        if (res.deletedCount > 0 || res.affectedRows > 0) {
                                            const idMatch = res.id;
                                            console.log("Deleting item with ID:", idMatch);
                                            if (idMatch) {
                                                setState((prev) => {
                                                    const newState = prev.filter((item) => item._id !== idMatch && item.id != idMatch);
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
                                                const newState = prev.map((item) => item._id === res.updatedId || item.id == res.updatedId
                                                    ? Object.assign(Object.assign({}, item), res.updatedDoc) : item);
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
                            if (callback)
                                callback(response);
                        }
                        else {
                            console.error(`${method} failed:`, response.message);
                            if (callback)
                                callback(response);
                        }
                    });
                }
            },
        };
        return builder;
    }
    get(channel) {
        return this.createActionBuilder(channel, "get", this);
    }
    delete(channel) {
        return this.createActionBuilder(channel, "delete", this);
    }
    update(channel) {
        return this.createActionBuilder(channel, "update", this);
    }
    add(channel) {
        console.log("Creating action builder for", channel);
        return this.createActionBuilder(channel, "insert", this);
    }
    //------ NOTIFICATIONS SCOPE ------
    subscribeToNotification(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initializeNotification();
            }
            if (!userId) {
                console.log('Error: User ID is required');
                throw new Error('User ID is required');
            }
            ;
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
                const permission = yield Notification.requestPermission();
                if (permission !== 'granted') {
                    console.log('Error: Notification permission denied');
                    throw new Error('Notification permission denied');
                }
                const registration = yield navigator.serviceWorker.register('/service-worker.js');
                console.log('Service Worker registered successfully');
                const subscription = yield registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.publicVapidKey),
                });
                this.socket.emit('subscribe:not', { userId, subscription });
                console.log(`User ${userId} subscribed to push notifications`);
            }
            catch (error) {
                alert(`Subscription failed: ${error.message}`);
                throw error;
            }
        });
    }
    unsubscribeFromNotification(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initializeNotification();
            }
            if (!userId)
                throw new Error('User ID is required');
            const registration = yield navigator.serviceWorker.ready;
            const subscription = yield registration.pushManager.getSubscription();
            if (subscription) {
                yield subscription.unsubscribe();
                this.socket.emit('unsubscribe:not', { userId, subscription });
                console.log(`User ${userId} unsubscribed from push notifications`);
            }
        });
    }
    sendNotification(userId, notificationBody) {
        if (this.connectionInfo) {
            this.initializeNotification();
        }
        if (!notificationBody || typeof notificationBody !== 'object') {
            throw new Error('Notification body must be a valid object');
        }
        this.socket.emit('sendNotification', { userId, notification: notificationBody });
    }
    // ACCOUNT SCOPE
    signUp(email, password, callback) {
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
    signIn(email, password, callback) {
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
    signUpSuper(email, password, callback) {
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
    signInSuper(email, password, callback) {
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
    validate(token, callback) {
        this.initialize();
        this.socket.emit("account:action", { action: "validate", token });
        this.socket.on("account:result", (response) => {
            console.log("Validate response:", response);
            callback(response);
        });
        return this;
    }
    account() {
        this.initialize();
        function getCookie(cname) {
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
            get: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("account:action", { action: "getAccount", token });
                this.socket.on("account:get", (response) => {
                    console.log("Get account response:", response);
                    callback(response);
                });
                return this;
            },
            getSession: (callback) => {
                const token = localStorage.getItem("t_auth");
                const session = getCookie("t_auth");
                this.socket.emit("account:action", { action: "getSession", token, session });
                this.socket.on("account:session", (response) => {
                    console.log("Get session response:", response);
                    callback(response);
                });
                return this;
            },
            getSessions: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("account:action", { action: "getSessions", token });
                this.socket.on("account:session", (response) => {
                    console.log("Get session response:", response);
                    callback(response);
                });
                return this;
            },
            setSession: (sessionData, callback) => {
                const session = getCookie("t_auth");
                this.socket.emit("account:action", { action: "setSessions", session, data: sessionData });
                this.socket.on("account:result", (response) => {
                    console.log("Set session response:", response);
                    callback(response);
                });
                return this;
            },
            killSession: (callback) => {
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
            killSessions: (callback) => {
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
            changeSession: (newSessionString, callback) => {
                const session = getCookie("t_auth");
                this.socket.emit("account:action", { action: "changeSession", session, data: newSessionString });
                this.socket.on("account:result", (response) => {
                    console.log("Change session response:", response);
                    callback(response);
                });
                return this;
            },
            // Labels Management
            setLabels: (labels, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "setLabels", token, labels });
                this.socket.on("labels:result", (response) => {
                    console.log("Set labels response:", response);
                    callback(response);
                });
                return this;
            },
            getLabels: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "getLabels", token });
                this.socket.on("labels:result", (response) => {
                    console.log("Get labels response:", response);
                    callback(response);
                });
                return this;
            },
            deleteLabels: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "deleteLabels", token });
                this.socket.on("labels:result", (response) => {
                    console.log("Delete labels response:", response);
                    callback(response);
                });
                return this;
            },
            // Preferences Management
            setPreference: (key, value, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "setPreference", token, key, value });
                this.socket.on("preferences:result", (response) => {
                    console.log("Set preference response:", response);
                    callback(response);
                });
                return this;
            },
            updatePreference: (key, value, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "updatePreference", token, key, value });
                this.socket.on("preferences:result", (response) => {
                    console.log("Update preference response:", response);
                    callback(response);
                });
                return this;
            },
            deletePreferenceKey: (key, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "deletePreferenceKey", token, key });
                this.socket.on("preferences:result", (response) => {
                    console.log("Delete preference key response:", response);
                    callback(response);
                });
                return this;
            },
            getPreferences: (callback) => {
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
    listenToAccountUpdates(callback) {
        this.socket.on("account:updates", (update) => {
            console.log("Account update received:", update);
            callback(update);
        });
        return this;
    }
    //------ USERS SCOPE ------
    users() {
        this.initialize();
        return {
            listAll: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("users:action", { action: "listAll", token });
                this.socket.on("users:result", (response) => {
                    console.log("List all users response:", response);
                    if (response.status === "success") {
                        callback(response.data);
                    }
                    else {
                        callback([]);
                    }
                });
                return this;
            },
            listOnline: (callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("users:action", { action: "listOnline", token });
                this.socket.on("users:online", (response) => {
                    console.log("List online users response:", response);
                    if (response.status === "success") {
                        console.log("Online users:", response.data);
                        callback(response.data);
                    }
                    else {
                        callback([]);
                    }
                });
                return this;
            },
            listenOnlineUsers: (callback) => {
                this.socket.emit("subscribe", "users:onlineChanged");
                this.socket.on("users:onlineChanged", (onlineUsersData) => {
                    console.log("Online users changed:", onlineUsersData);
                    callback(onlineUsersData);
                });
                return this;
            },
            getUser: (userId, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("users:action", { action: "getUser", token, userId });
                this.socket.on("users:get-user", (response) => {
                    console.log("Get user response:", response);
                    callback(response);
                });
                return this;
            },
            getUsers: (userIds, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("users:action", { action: "getUsers", token, userIds });
                this.socket.on("users:get-users", (response) => {
                    console.log("Get users response:", response);
                    callback(response);
                });
                return this;
            },
            // Labels Management
            setLabels: (userId, labels, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "setLabels", token, userId, labels });
                this.socket.on("labels:result", (response) => {
                    console.log("Set labels response:", response);
                    callback(response);
                });
                return this;
            },
            getLabels: (userId, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "getLabels", token, userId });
                this.socket.on("labels:result", (response) => {
                    console.log("Get labels response:", response);
                    callback(response);
                });
                return this;
            },
            deleteLabels: (userId, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("labels:action", { action: "deleteLabels", token, userId });
                this.socket.on("labels:result", (response) => {
                    console.log("Delete labels response:", response);
                    callback(response);
                });
                return this;
            },
            // Preferences Management
            setPreference: (userId, key, value, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "setPreference", token, userId, key, value });
                this.socket.on("preferences:result", (response) => {
                    console.log("Set preference response:", response);
                    callback(response);
                });
                return this;
            },
            updatePreference: (userId, key, value, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "updatePreference", token, userId, key, value });
                this.socket.on("preferences:result", (response) => {
                    console.log("Update preference response:", response);
                    callback(response);
                });
                return this;
            },
            deletePreferenceKey: (userId, key, callback) => {
                const token = localStorage.getItem("t_auth");
                this.socket.emit("preferences:action", { action: "deletePreferenceKey", token, userId, key });
                this.socket.on("preferences:result", (response) => {
                    console.log("Delete preference key response:", response);
                    callback(response);
                });
                return this;
            },
            getPreferences: (userId, callback) => {
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
    createBucket() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit('bucket:action', { action: 'create', token });
                this.socket.once('bucket:created', ({ bucketId }) => {
                    console.log(`Bucket created: ${bucketId}`);
                    resolve(bucketId);
                });
                this.socket.once('error', ({ message }) => {
                    console.log(`Error creating bucket: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    uploadFile(bucketId, file) {
        return __awaiter(this, void 0, void 0, function* () {
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
                this.socket.emit('bucket:action', { action: 'upload', bucketId, file, token });
                this.socket.once('file:uploaded', ({ bucketId: returnedBucketId, fileId }) => {
                    console.log(`File uploaded to ${returnedBucketId}: ${fileId}`);
                    resolve(fileId);
                });
                this.socket.once('error', ({ message }) => {
                    console.log(`Error uploading file: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    getFile(bucketId, fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            if (!bucketId || !fileId) {
                console.log('Error: Bucket ID and file ID are required');
                throw new Error('Bucket ID and file ID are required');
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit('bucket:action', { action: 'get', bucketId, fileId, token });
                this.socket.once('file:retrieved', (retrievedFile) => {
                    console.log(`File retrieved from ${bucketId}: ${retrievedFile.fileName}`);
                    resolve(retrievedFile);
                });
                this.socket.once('error', ({ message }) => {
                    console.log(`Error retrieving file: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    listFiles(bucketId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            if (!bucketId) {
                console.log('Error: Bucket ID is required');
                throw new Error('Bucket ID is required');
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit('bucket:action', { action: 'list', bucketId, token });
                this.socket.once('file:listed', ({ bucketId: returnedBucketId, files }) => {
                    console.log(`Listed ${files.length} files in ${returnedBucketId}`);
                    resolve(files);
                });
                this.socket.once('error', ({ message }) => {
                    console.log(`Error listing files: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    deleteFile(bucketId, fileId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            if (!bucketId || !fileId) {
                console.log('Error: Bucket ID and file ID are required');
                throw new Error('Bucket ID and file ID are required');
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit('bucket:action', { action: 'deleteFile', bucketId, fileId, token });
                this.socket.once('file:delete', ({ bucketId: returnedBucketId, fileId: deletedFileId }) => {
                    console.log(`File ${deletedFileId} deleted from ${returnedBucketId}`);
                    resolve();
                });
                this.socket.once('error', ({ message }) => {
                    console.log(`Error deleting file: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    listBuckets() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("bucket:action", { action: "bucketList", token });
                this.socket.once("bucket:listed", ({ buckets }) => {
                    console.log(`Listed ${buckets.length} buckets`);
                    resolve(buckets);
                });
                this.socket.once("error", ({ message }) => {
                    console.log(`Error listing buckets: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    deleteBucket(bucketId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            if (!bucketId) {
                console.log("Error: Bucket ID is required");
                throw new Error("Bucket ID is required");
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("bucket:action", { action: 'delete', bucketId, token });
                this.socket.once("bucket:deleted", ({ bucketId: deletedBucketId }) => {
                    console.log(`Bucket ${deletedBucketId} deleted`);
                    resolve();
                });
                this.socket.once("error", ({ message }) => {
                    console.log(`Error deleting bucket: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    renameBucket(oldBucketId, newBucketId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            if (!oldBucketId || !newBucketId) {
                console.log("Error: Old and new bucket IDs are required");
                throw new Error("Old and new bucket IDs are required");
            }
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("bucket:action", { action: 'rename', bucketId: oldBucketId, newBucketId, token });
                this.socket.once("bucket:renamed", ({ oldBucketId: oldId, newBucketId: newId }) => {
                    console.log(`Bucket renamed from ${oldId} to ${newId}`);
                    resolve();
                });
                this.socket.once("error", ({ message }) => {
                    console.log(`Error renaming bucket: ${message}`);
                    reject(new Error(message));
                });
            });
        });
    }
    //------ PERMISSION SCOPE ------
    createPermission(itemId, requireAction, requireRole) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("permission", { action: "create", itemId, requireAction, requireRole });
                this.socket.once("permissionCreated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    getPermission(permissionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("permission", { action: "get", permissionId });
                this.socket.once("permission", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    getPermissions(itemId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("permission", { action: "getAll", itemId });
                this.socket.once("permissions", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    updatePermission(permissionId, itemId, requireAction, requireRole) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("permission", { action: "update", permissionId, itemId, requireAction, requireRole });
                this.socket.once("permissionUpdated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    deletePermission(permissionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("permission", { action: "delete", permissionId });
                this.socket.once("permissionDeleted", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    createUserPermission(userId, onDoc, permission) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("userPermission", { action: "create", userId, onDoc, permission });
                this.socket.once("userPermissionCreated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    getUserPermissions(userId, onDoc) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("userPermission", { action: "getAll", userId, onDoc });
                this.socket.once("userPermissions", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    updateUserPermission(permissionId, onDoc, permission) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("userPermission", { action: "update", permissionId, onDoc, permission });
                this.socket.once("userPermissionUpdated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    deleteUserPermission(permissionId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("userPermission", { action: "delete", permissionId });
                this.socket.once("userPermissionDeleted", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    checkUserPermission(userId, onDoc, requiredPermission) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo) {
                this.initialize();
            }
            return new Promise((resolve, reject) => {
                this.socket.emit("userPermission", { action: "check", userId, onDoc, requiredPermission });
                this.socket.once("userPermissionCheck", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    //------ TEAMS SCOPE ------
    createTeam(name, styling, creatorId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "create", name, styling, creatorId, token });
                this.socket.once("teamCreated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    getTeam(teamId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "get", teamId, token });
                this.socket.once("team", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    getTeams(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "getAll", userId, token });
                this.socket.once("teams", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    updateTeam(teamId, name, styling, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "update", teamId, name, styling, userId, token });
                this.socket.once("teamUpdated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    deleteTeam(teamId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "delete", teamId, userId, token });
                this.socket.once("teamDeleted", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    addTeamUser(teamId, userId, role, addedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "addUser", teamId, userId, role, addedBy, token });
                this.socket.once("teamUserAdded", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    removeTeamUser(teamId, userId, removedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "removeUser", teamId, userId, removedBy, token });
                this.socket.once("teamUserRemoved", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    updateTeamUserRole(teamId, userId, role, updatedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "updateUserRole", teamId, userId, role, updatedBy, token });
                this.socket.once("teamUserRoleUpdated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    updateTeamUserLabels(teamId, userId, labels, updatedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "updateUserLabels", teamId, userId, labels, updatedBy, token });
                this.socket.once("teamUserLabelsUpdated", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    leaveTeam(teamId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "leave", teamId, userId, token });
                this.socket.once("teamUserLeft", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    listTeams() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionInfo)
                this.initialize();
            const token = localStorage.getItem("t_auth");
            return new Promise((resolve, reject) => {
                this.socket.emit("teams", { action: "listAll", token });
                this.socket.once("teams", (data) => resolve(data));
                this.socket.once("error", (error) => reject(new Error(error.message)));
            });
        });
    }
    close() {
        this.socket.close();
    }
}
