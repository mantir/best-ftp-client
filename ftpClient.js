import Ftp from "ftp";
import SFTPClient from "ssh2-sftp-client";
import fs from "fs";
import pathLib from "path";
import { Readable } from "stream";


export default class BestFTPClient {

  static async connect(config) {
    var ftpClient = new BestFTPClient();
    await ftpClient.init(config);
    return ftpClient;
  }

  async init({ client, host, user, password, port, protocol = 'ftp' }) {
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

      this.listFun = (path) => new Promise((resolve, reject) => {
        client.list(path, (err, list) => { if (err) return reject(err); resolve(list); });
      });

      this.getFun = (path) => new Promise((resolve, reject) => {
        client.get(path, (err, stream) => { if (err) return reject(err); resolve(stream); });
      });

      this.putFun = (localPath, remotePath) => new Promise((resolve, reject) => {
        client.put(localPath, remotePath, (err) => { if (err) return reject(err); resolve(true); });
      });
      this.mkdirFun = (path) => new Promise((resolve, reject) => {
        client.mkdir(path, true, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      this.existsFun = (path) => new Promise((resolve, reject) => {
        client.list(path, (err, list) => {
          if (err) {
            if (err.code === 550) {
              resolve(false);
            } else {
              reject(err);
            }
          } else {
            resolve(true);
          }
        });
      });
      this.deleteFun = (path) => new Promise((resolve, reject) => {
        client.delete(path, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      this.end = () => client.end();
      await client.connect(ftpOptions);
    } else if (protocol === 'sftp') {
      var client = new SFTPClient();
      ftpOptions.port = port || 22
      client.on('error', (err) => {
        console.error('SFTP-Connection error:', err);
      });
      this.listFun = (path) => { return client.list(path) };
      this.getFun = async (path) => Readable.from(await client.get(path));
      this.putFun = (localPath, remotePath) => client.put(localPath, remotePath);
      this.mkdirFun = (path) => client.mkdir(path, true);
      this.deleteFun = (path) => client.delete(path);
      this.existsFun = async (path) => {
        try {
          await client.stat(path).catch((err) => { throw err })
          return true;
        } catch (err) {
          if (err.code === "ENOENT") {
            return false;
          } else {
            throw err;
          }
        }
      };
      this.end = () => client.end();
      await client.connect(ftpOptions);
    } else {
      throw new Error('Unsupported protocol');
    }
  }

  async list(path) {
    return await this.listFun(path)
  }

  async get(path) {
    return await this.getFun(path);
  }

  async put(localPath, remotePath) {
    return await this.putFun(localPath, remotePath);
  }

  async delete(path) {
    return await this.deleteFun(path);
  }

  async mkdir(path) {
    return await this.mkdirFun(path);
  }

  async exists(path) {
    return await this.existsFun(path);
  }

  async downloadFiles(sourceFolderOrFiles, targetFolder) {
    var paths = [], errorMessage;
    try {
      var files;
      if (Array.isArray(sourceFolderOrFiles)) {
        var files = sourceFolderOrFiles.map(name => name.name ? name : ({ name }));
      } else {
        var files = await this.list(sourceFolderOrFiles);
      }

      for (const file of files) {
        const localFile = `${targetFolder}/${pathLib.basename(file.name)}`;
        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }
        if (fs.existsSync(localFile)) {
          console.log(`${localFile} already exists, overwrite ...`);
        }
        var error = await this.downloadFile(file.name, localFile).catch((err) => { throw err })
        if (!error) {
          console.log(`Downloaded ${file.name} to ${localFile}`);
          paths.push(localFile);
        }
      }
    } catch (err) {
      console.error(err);
      errorMessage = err.message;
    }
    return { client: this, paths, errorMessage }
  }

  async downloadFile(fileName, localFile) {
    return new Promise(async (resolve, reject) => {
      try {
        const stream = await this.get(fileName);
        const writeStream = fs.createWriteStream(localFile);
        stream.on('error', (error) => {
          reject(error);
        });
        writeStream.on('error', (error) => {
          reject(error);
        });
        writeStream.on('finish', () => {
          resolve();
        });
        stream.pipe(writeStream);
      } catch (error) {
        reject(error);
      }
    });
  }

  async uploadFiles(localFiles, remoteFolder) {
    var paths = [], errorMessage;
    var targetDirs = {};
    try {
      for (const localFile of localFiles) {
        const remoteFile = `${remoteFolder}/${pathLib.basename(localFile)}`;
        const remoteDir = pathLib.dirname(remoteFile);
        if (!targetDirs[remoteDir]) {
          if (!(await this.exists(remoteDir))) {
            await this.mkdir(remoteDir);
          }
          targetDirs[remoteDir] = true;
        }
        console.log(`Upload ${localFile} to ${remoteFile}`);
        await this.put(localFile, remoteFile);
        paths.push(remoteFile);
      }
    } catch (err) {
      console.error(err);
      errorMessage = err.message;
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
    return allFiles;
  }

}