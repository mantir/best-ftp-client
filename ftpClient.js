import Ftp from "ftp";
import SFTPClient from "ssh2-sftp-client";
import fs from "fs";
import pathLib from "path";
import { Readable } from "stream";


export default class BestFTPClient {

  constructor(config) {
    this.config = config;
    this.setFtpClient(config);
  }

  async setFtpClient({ client, host, user, password, port, protocol = 'ftp' }) {
    console.log('get client for ' + protocol);
    const ftpOptions = {
      host, user, password: password,
    };
    if (protocol === 'ftp' || protocol === 'ftps') {
      var client = new Ftp();
      if (protocol === 'ftps') {
        ftpOptions.secure = true;
        // Add additional secureOptions if necessary, e.g.:
        // ftpOptions.secureOptions = {
        //   rejectUnauthorized: false,
        // };
      }
      client.on('error', (err) => {
        console.error('FTP-Connection error:', err);
      });
      ftpOptions.port = port || 21
      await client.connect(ftpOptions);

      this.list = (path) => new Promise((resolve, reject) => {
        client.list(path, (err, list) => { if (err) return reject(err); resolve(list); });
      });

      this.get = (path) => new Promise((resolve, reject) => {
        client.get(path, (err, stream) => { if (err) return reject(err); resolve(stream); });
      });

      this.put = (localPath, remotePath) => new Promise((resolve, reject) => {
        client.put(localPath, remotePath, (err) => { if (err) return reject(err); resolve(true); });
      });
    } else if (protocol === 'sftp') {
      var client = new SFTPClient();
      ftpOptions.port = port || 22
      client.on('error', (err) => {
        console.error('SFTP-Connection error:', err);
      });
      await client.connect(ftpOptions);
      this.list = async (path) => client.list(path);
      this.get = async (path) => Readable.from(await client.get(path));
      this.put = async (localPath, remotePath) => await client.put(localPath, remotePath);
    } else {
      throw new Error('Unsupported protocol');
    }
  }

  async downloadFiles(sourceFolderOrFiles, targetFolder) {
    var paths = [];
    try {
      var files;
      if (Array.isArray(sourceFolderOrFiles)) {
        var files = sourceFolderOrFiles.map(name => ({ name }));
      } else {
        var files = await this.ls(sourceFolderOrFiles);
      }

      for (const file of files) {
        const localFile = `${targetFolder}/${pathLib.basename(file.name)}`;
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }
        if (fs.existsSync(localFile)) {
          console.log(`${localFile} already exists, overwrite ...`);
        }

        var stream = await client.getFun(`${file.name}`)
        console.log(`Downloaded ${file.name} to ${localFile}`);
        stream.pipe(fs.createWriteStream(localFile));
        paths.push(localFile);
      }
    } catch (err) {
      console.error(err);
    }
    return { client: this, paths }
  }

  async uploadFiles(localFiles, remoteFolder) {
    var paths = [], errorMessage;
    try {
      if (!client) {
        client = await this.getFtpClient(loginData)
      }
      for (const localFile of localFiles) {
        const remoteFile = `${remoteFolder}/${pathLib.basename(localFile)}`;
        console.log(`Upload ${localFile} to ${remoteFile}`);
        try {
          await this.put(localFile, remoteFile);
        } catch (e) {
          errorMessage = e.message;
          break;
        }
        paths.push(remoteFile);
      }
      client.end();
    } catch (err) {
      console.error(err);
    }
    return { client: this, paths, errorMessage }
  }

  async listRecursive(folder) {
    var allFiles = [];
    try {
      const listFilesRecursively = async (ftpPath) => {
        const files = await this.list(ftpPath);
        for (const f of files) {
          if (f.type === 'd') {
            await listFilesRecursively(`${ftpPath}/${f.name}`);
          } else {
            allFiles.push(`${ftpPath}/${f.name}`);
          }
        }
      }
      await listFilesRecursively(folder);
    } catch (err) {
      console.log(err);
    }
    return { client: this, files: allFiles };
  }

}