declare global {
    interface Navigator {
        standalone?: boolean;
    }
}
interface ActionBuilder {
    query(queryCode: string): ActionBuilder;
    setState(setter: React.Dispatch<React.SetStateAction<any[]>>): ActionBuilder;
    callback(fn: (data: any) => void): ActionBuilder;
    execute(): void;
}
export declare class Client {
    private socket;
    private dbType;
    private connectionInfo;
    publicVapidKey: string;
    private isInitialized;
    private initializePromise;
    constructor(url?: string);
    token(): string | null;
    urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer>;
    database(type: "mongodb" | "mysql"): Client;
    connection(connectionInfo: any): Promise<this>;
    private initialize;
    private initializeAsync;
    private ensureInitialized;
    private initializeNotification;
    private closeConnection;
    subscribe(channel: string, callback: (data: any) => void): Client;
    listen(channel: string, callback: (data: any) => void): Client;
    unsubscribe(channel: string): Client;
    send(channel: string, data: any): Client;
    execute(channel: string, query: string, callback: (data: any) => void): Client;
    private createActionBuilder;
    get(channel: string): ActionBuilder;
    delete(channel: string): ActionBuilder;
    update(channel: string): ActionBuilder;
    add(channel: string): ActionBuilder;
    subscribeToNotification(userId: string): Promise<void>;
    unsubscribeFromNotification(userId: string): Promise<void>;
    sendNotification(userId: string, notificationBody: {
        title: string;
        message: string;
    }): void;
    signUp(email: string, password: string, callback: (data: any) => void): Client;
    signIn(email: string, password: string, callback: (data: any) => void): Client;
    signUpSuper(email: string, password: string, callback: (data: any) => void): Client;
    signInSuper(email: string, password: string, callback: (data: any) => void): Client;
    validate(token: string, callback: (data: any) => void): Client;
    account(): {
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
    };
    listenToAccountUpdates(callback: (data: any) => void): Client;
    users(): {
        listAll: (callback: (data: any[]) => void) => Client;
        listOnline: (callback: (data: any[]) => void) => Client;
        listenOnlineUsers: (callback: (data: any[]) => void) => Client;
        getUser: (userId: string, callback: (data: any) => void) => Client;
        getUsers: (userIds: string[], callback: (data: any) => void) => Client;
        setLabels: (userId: string, labels: string[], callback: (data: any) => void) => Client;
        getLabels: (userId: string, callback: (data: any) => void) => Client;
        deleteLabels: (userId: string, callback: (data: any) => void) => Client;
        setPreference: (userId: string, key: string, value: any, callback: (data: any) => void) => Client;
        updatePreference: (userId: string, key: string, value: any, callback: (data: any) => void) => Client;
        deletePreferenceKey: (userId: string, key: string, callback: (data: any) => void) => Client;
        getPreferences: (userId: string, callback: (data: any) => void) => Client;
    };
    createBucket(): Promise<string>;
    uploadFile(bucketId: string, file: {
        name: string;
        type: string;
        data: ArrayBuffer;
    }): Promise<string>;
    getFile(bucketId: string, fileId: string): Promise<{
        fileName: string;
        fileType: string;
        fileData: ArrayBuffer;
    }>;
    listFiles(bucketId: string): Promise<{
        id: string;
        fileName: string;
        fileType: string;
        createdAt: string;
        updatedAt: string;
    }[]>;
    deleteFile(bucketId: string, fileId: string): Promise<void>;
    listBuckets(): Promise<string[]>;
    deleteBucket(bucketId: string): Promise<void>;
    renameBucket(oldBucketId: string, newBucketId: string): Promise<void>;
    createPermission(itemId: string, requireAction: string, requireRole: string | null): Promise<any>;
    getPermission(permissionId: string): Promise<any>;
    getPermissions(itemId: string | null): Promise<any>;
    updatePermission(permissionId: string, itemId: string, requireAction: string, requireRole: string | null): Promise<any>;
    deletePermission(permissionId: string): Promise<any>;
    createUserPermission(userId: string, onDoc: string, permission: string): Promise<any>;
    getUserPermissions(userId: string, onDoc: string | null): Promise<any>;
    updateUserPermission(permissionId: string, onDoc: string, permission: string): Promise<any>;
    deleteUserPermission(permissionId: string): Promise<any>;
    checkUserPermission(userId: string, onDoc: string, requiredPermission: string): Promise<any>;
    createTeam(name: string, styling: string, creatorId: string): Promise<any>;
    getTeam(teamId: string): Promise<any>;
    getTeams(userId: string | null): Promise<any>;
    updateTeam(teamId: string, name: string, styling: string, userId: string): Promise<any>;
    deleteTeam(teamId: string, userId: string): Promise<any>;
    addTeamUser(teamId: string, userId: string, role: string, addedBy: string): Promise<any>;
    removeTeamUser(teamId: string, userId: string, removedBy: string): Promise<any>;
    updateTeamUserRole(teamId: string, userId: string, role: string, updatedBy: string): Promise<any>;
    updateTeamUserLabels(teamId: string, userId: string, labels: string[], updatedBy: string): Promise<any>;
    leaveTeam(teamId: string, userId: string): Promise<any>;
    listTeams(): Promise<any>;
    close(): void;
}
export {};
