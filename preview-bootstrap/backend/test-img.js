const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/uploads/1766416057909-0b724daf2e09fa41.png',
  method: 'HEAD'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();