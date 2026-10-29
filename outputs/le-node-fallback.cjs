// Windows sandbox occasionally cannot resolve the local account (uv_os_get_passwd).
// Keep normal behavior whenever the OS lookup succeeds.
const os = require('node:os');
const original = os.userInfo;
os.userInfo = (...args) => {
  try { return original(...args); }
  catch (error) {
    if (error.code !== 'ERR_SYSTEM_ERROR' || error.info?.syscall !== 'uv_os_get_passwd') throw error;
    return { username: process.env.USERNAME || 'Admin', homedir: process.env.USERPROFILE, uid: -1, gid: -1, shell: null };
  }
};
