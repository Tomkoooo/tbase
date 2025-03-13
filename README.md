# Tbase - Simple Socket-Based Backend Library

![npm](https://www.npmjs.com/package/@tomkoooo/tbase) ![License](https://www.npmjs.com/package/@tomkoooo/tbase)

**Tbase** is a lightweight, socket-based backend solution packed into a single npm library. With just one `Client` class and a prebuilt server, you can set up a fully functional backend in as little as 10 lines of code. No need for complex API routes or server modifications—Tbase handles it all out of the box.

**Demo at: [Github](https://github.com/Tomkoooo/tbase-demo)**

## Key Features
- **Real-Time Sockets**: Built-in WebSocket support for effortless real-time communication.
- **Database Support**: Seamless integration with MongoDB (NoSQL) and MySQL (SQL).
- **Authentication**: JWT-based sign-up/sign-in with session management.
- **Database Actions**: Prebuilt CRUD operations (`get`, `add`, `update`, `delete`) with real-time updates.
- **User Management**: Permissions, teams, and online user tracking.
- **File Storage**: Bucket-based file API for uploads and management.
- **Push Notifications**: Cross-platform notifications with VAPID and APNs support.
- **SSR & CSR**: Works on both server-side rendering (SSR) and client-side rendering (CSR).
- **Frontend Freedom**: Control everything from the frontend—no backend setup required.
- **Permission and Preferences**: On account and users-scope.

- **Mailer**: Send mails and handle user verifications on the frontend. (in development.)

---

## Getting Started

### Installation
Install Tbase via npm: (still in development)
```bash
npm install @tomkoooo/tbase
```
### Basic Setup
Tbase provides a Client class as the main entry point. Initialize it with optional WebSocket server URI (defaults to localhost:3000 if not specified).

```javascript

const { Client } = require('tbase');

// Basic client setup
const client = new Client(); // Uses default server at localhost:3000
```

#### Database Connection
Connect to MongoDB or MySQL with a simple configuration:

- MongoDB:
```javascript

export const mongoClient = new Client()
  .database('mongodb')
  .connection({
    url: 'mongodb://localhost:27017',
    dbName: 'socket-test',
  });
  ```
- MySQL:
```javascript
export const mysqlClient = new Client()
  .database('mysql')
  .connection({
    host: 'localhost',
    user: 'root',
    port: 3306,
    database: 'socket-test',
  });
  ```

Once connected, you're linked to both the socket server and your database!

## Core Features
### 1. Socket Communication
Real-time communication is at the heart of Tbase. Use these methods to interact with sockets:

 **Subscribe/Listen: Listen to events on a specific channel.**
```javascript

client.subscribe('chat', (message) => {
  console.log('Chat message:', message);
});
```
**Unsubscribe: Stop listening to a channel.**
```javascript

client.unsubscribe('chat');
```
 **Send: Emit data to a channel.**

```javascript

client.send('chat', 'Hello, world!');
```
 **Example (React):**

```javascript

useEffect(() => {
  client.subscribe('chat', (message) => {
    setMessages((prev) => [...prev, message.message]);
  });
  return () => client.unsubscribe('chat');
}, []);
```
***
### 2. Database Operations
Perform CRUD operations with real-time updates using the ActionBuilder:

 **Get Data:**
```javascript

mongoClient
  .get('users')
  .query("collection('users').find().toArray()")
  .setState(setUsers) // Optional: Update state based on the CRUD method
  .callback((response) => console.log('Response:', response))
  .execute();
  ```
Other Actions: Use add, update, or delete similarly.
 **Raw Query:**
```javascript

mysqlClient.execute('users', 'SELECT * FROM users', (data) => console.log(data));
```
***
### 3. Authentication (client.account())
Manage user authentication with ease:

 **Sign Up/Sign In:**
```javascript

databaseClient.signUp('user@example.com', 'password', (data) => console.log(data));
databaseClient.signIn('user@example.com', 'password', (data) => console.log(data));
databaseClient.validate('jwt_string' (data) => console.log(data)); //gives back the user by provided jwt
```
Returns a JWT (stored in localStorage) and session ID (stored in cookies) under t_auth.

 **Get User:**
```javascript

databaseClient.account().get((user) => console.log(user));
```
Returns a user object if there is a valid JWT token stored

**Session Management: Use getSession, killSession, setSession, etc**
- **public getSessions: (callback: (data: any) => void)**
    - Gives back all the user's sessions if there is a valid JWT registered 
    - Note: on server-side use the database class and on that the getSessions method with the userId as a parameter
- **public setSession: (sessionData: string, callback: (data: any) => void)**
    - Register a new session with the sessionData string if there is a valid JWT
    - Note: on server-side use the database class and on that the setSession method with the userId and the new sessionId string as a parameter
- **public killSession: (callback: (data: any) => void)**
    - Kills the user current session from the database and removes the tokens from localStorage and cookies 
    - Note: on server-side use the database class and on that the kilSession method with the sessionId as a parameter
- **public killSessions: (callback: (data: any) => void)**
    - Kills the user's all session from the database and removes the tokens from localStorage and cookies 
    - Note: on server-side use the database class and on that the kilSessions method with the userId as a parameter
- **public changeSession: (newSessionString: sring, callback: (data: any) => void)**
    - Changes the user's current session if there is a valid JWT
    Note: It not updates the cookies
    - Note: on server-side use the database class and on that the changeSession method with the changable sessionId and the new sessionId as a parameter
***
### 4. User Management (client.users())
***Requires an active JWT session:***
**List Users:**
```javascript

databaseClient.users().listAll((users) => console.log(users));
databaseClient.users().getUser('userId2', (users) => console.log(users)); // gives back specific user obj
databaseClient.users().getUsers(['userid1', 'userid2'], (users) => console.log(users)); // gives back users obj in an array by their userId from a list
databaseClient.users().listOnline((onlineUsers) => console.log(onlineUsers));
//Note a user can be online if after socket connection there is a getAccount or getSession call (client-sde authentication)
```
**Real-Time Online Users:**
```javascript
client.users().listenOnlineUsers((users) => console.log(users));
```
***
### 5. File Storage (Bucket API)
Store and manage files in buckets:
***JWT session needed***

**Create Bucket:**
```javascript

const bucketId = await databaseClient.createBucket();
```
**Upload File:**
```javascript

await databaseClient.uploadFile(bucketId, { name: 'file.txt', type: 'text/plain', data: buffer });
 ```
**List Files:**
```javascript

const files = await databaseClient.listFiles(bucketId);
```
**Other calls:**
```javascript
await databaseClient.deleteFile(bucketId, fileId); //deletes a file in the bucket
const buckets = await databaseClient.listBuckets(); //list of all existing buckets in the db
await databaseClient.deleteBucket(bucketId); //deletes the corresponfing bucket table
await databaseClient.renameBucker(bucketId, newBucketString); //renames the bucket Note: new name = bucket_{newNameString}
```
***
### 6. Push Notifications
Enable notifications with VAPID keys (and optional APNs for Apple):

**Subscribe/unsubscribe:**

```javascript
client.subscribeToNotification('user123');
client.unsubscribeFromNotification('user123');
```
**Send Notification:**
```javascript

client.sendNotification('user123', { title: 'Hello', message: 'New update!' }); //sends notification with the corresponding user based on userId
```
***
### 7. Server-Side Rendering (SSR)
Use the Database class for server-side operations:

```javascript

const { Database, MongoDB } = require('tbase');

const db = new Database(new MongoDB({
  url: 'mongodb://localhost:27017',
  dbName: 'socket-test',
}));

// Get user session
export const getSession = async (sessionId) => {
  return await db.getSession(sessionId);
};
```
#### **avaible methods under database: db.{method name}**

***account***
- async signUp(payload: {email: string, password: string})
- async signIn(email, password)
- async getAccount(userId)
- async getSession(sessionId)
- async getSessions(userId)
- async setSession(userId, sessionId)
- async killSession(sessionId)
- async killSessions(userId)
- async changeSession(sessionId, newSessionId)  

***users***
- async getUser(userId)
- async getUsers(userIds)
- async listUsers()

***Notification***
- async storeSubscription(userId, subscription) 
  - subscription obj generated by the notification class
- async upsert(table, data) 
  - updates/inserts the subscription from the notification class
- async delete(table, query) 
  - deletes a subscription from the notification class
- async find(table, query)
  - finds a table and gives back every data that are in it 
  - used to retreive subscriptions in the notification clasy

***Bucket***
- async createBucket()
- async uploadFile(bucketId, file)
- async getFile(bucketId, fileId)
- async listFiles(bucketId)
- async deleteFile(bucketId, fileId)
- async listBuckets()
- async deleteBucket(bucketId)
- async renameBucket(oldBucketId, newBucketId)

***Permissions***
- item permissions
  - async createPermission(itemId, requireAction, requireRole = null)
  - async getPermission(permissionId)
  - async getPermissions(itemId = null)
  - async updatePermission(permissionId, itemId, requireAction, requireRole = null)
  - async deletePermission(permissionId)
- user permissions

***
### 8.Configuration
**Connection Info**
```typescript

interface ConnectionInfo {
  url?: string;        // MongoDB URL
  dbName?: string;     // Database name
  host?: string;       // MySQL host
  user?: string;       // MySQL user
  password?: string;   // MySQL password
  database?: string;   // MySQL database
  port?: number;       // MySQL port
}
```
**Environment Variables (Notifications)**
```bash

NEXT_PUBLIC_VAPID_PUBLIC=your_public_key
NEXT_PUBLIC_VAPID_PRIVATE=your_private_key
NEXT_PUBLIC_VAPID_MAIL=your_email@example.com
NEXT_PUBLIC_APNS_TEAM_ID=your_team_id
NEXT_PUBLIC_APNS_KEY_ID=your_key_id
NEXT_PUBLIC_APNS_KEY_FILE=path/to/key.pem
NEXT_PUBLIC_APNS_BUNDLE_ID=your_bundle_id
```
***
## Why Tbase?
***Simplicity:*** One class, one library, endless possibilities.
***Flexibility:*** Works with any frontend framework or SSR setup.
***Scalability:*** Real-time features and database support out of the box.

## Start building your next app with Tbase today!

License
MIT © Tomkoooo/sironic