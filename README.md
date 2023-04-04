# best-ftp-client

SFTP, FTP, FTPS, let's be honest: we don't care. We just want to send files around. You think so too? Then this client is for you. It's mainly a wrapper around the npm packages 'ssh2-sftp-client' and 'ftp'.

## Usage
```javascript
import bftp from "best-ftp-client"
var client = await bftp.connect({
  protocol: 'sftp' // ftp or ftps
  host: "ftp.example.com"
  user: "username"
  password: "password",
  port: "optional, default 21 for ftp(s), 22 for sftp"
});

let list = await client.list(path);
let listAll = await client.listRecursive(path);
let stream = await client.get(remoteFile)
stream.pipe(fs.createWriteStream(localFile));
await client.put(localFile, remoteFile)
await client.mkdir(remotePath)
let exists = await client.exists(remotePath)

let { paths } = await client.downloadFiles(remoteFolderOrFileNames, localFolder)
let { paths } = await client.uploadFiles(localFileNames, remoteFolder) // creates paths if not existing
```