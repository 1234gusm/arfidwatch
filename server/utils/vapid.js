const webpush = require('web-push');
const db = require('../db');

let _publicKey = null;

async function initVapid() {
  const pubRow  = await db('server_config').where({ key: 'vapid_public_key'  }).first();
  const privRow = await db('server_config').where({ key: 'vapid_private_key' }).first();

  let publicKey, privateKey;

  if (pubRow && privRow) {
    publicKey  = pubRow.value;
    privateKey = privRow.value;
  } else {
    const keys = webpush.generateVAPIDKeys();
    publicKey  = keys.publicKey;
    privateKey = keys.privateKey;
    await db('server_config').insert({ key: 'vapid_public_key',  value: publicKey  });
    await db('server_config').insert({ key: 'vapid_private_key', value: privateKey });
    console.log('Generated new VAPID keys');
  }

  webpush.setVapidDetails(
    'mailto:noreply@arfidwatch.app',
    publicKey,
    privateKey
  );

  _publicKey = publicKey;
  return publicKey;
}

function getPublicKey() {
  return _publicKey;
}

module.exports = { initVapid, getPublicKey };
