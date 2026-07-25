const fs = require('fs');
const path = require('path');

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const logFilePath = path.join(baseDir, 'app.log');

function logActivity(message, level = 'INFO') {
  const timestamp = new Date().toLocaleString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  
  if (level === 'ERROR') {
    console.error(message);
  } else if (level === 'WARN') {
    console.warn(message);
  } else {
    console.log(message);
  }

  try {
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (err) {
    console.error('Failed to append to app.log:', err);
  }
}

module.exports = {
  logActivity,
  logFilePath
};
