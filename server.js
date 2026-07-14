const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const conexionesActivas = {};

app.post('/conectar-live', async (req, res) => {
  const { tiktokUser, soloSeguidores } = req.body;

  if (!tiktokUser || typeof tiktokUser !== 'string' || !tiktokUser.trim()) {
    return res.status(400).json({ success: false, error: 'tiktokUser es requerido y debe ser una cadena.' });
  }

  if (typeof soloSeguidores !== 'boolean') {
    return res.status(400).json({ success: false, error: 'soloSeguidores es requerido y debe ser un booleano.' });
  }

  const username = tiktokUser.trim();

  if (conexionesActivas[username]) {
    return res.status(400).json({ success: false, error: 'Ya existe una conexión activa para este usuario de TikTok.' });
  }

  const connection = new WebcastPushConnection(username);
  const connectionData = {
    connection,
    soloSeguidores,
    cola: []
  };

  connection.on('chat', (data) => {
    const comment = String(data.comment || data.commentText || '').trim();
    const followRole = Number(data.followRole ?? data.user?.followRole ?? 0);

    console.log(`[${username}] mensaje de chat recibido: ${comment}`);

    if (connectionData.soloSeguidores && followRole <= 0) {
      console.log(`[${username}] mensaje ignorado porque soloSeguidores está activo y el remitente no es seguidor.`);
      return;
    }

    if (!comment.startsWith('!roblox')) {
      return;
    }

    const robloxUser = comment.slice('!roblox'.length).trim();
    if (!robloxUser) {
      console.log(`[${username}] comando !roblox recibido pero no se proporcionó nombre de Roblox.`);
      return;
    }

    if (connectionData.cola.includes(robloxUser)) {
      console.log(`[${username}] ${robloxUser} ya está en la cola, no se agrega de nuevo.`);
      return;
    }

    connectionData.cola.push(robloxUser);
    console.log(`[${username}] ${robloxUser} agregado a la cola. Cola actual:`, connectionData.cola);
  });

  connection.on('streamEnd', () => {
    console.log(`[${username}] el Live de TikTok finalizó. Desconectando y limpiando la conexión.`);
    if (conexionesActivas[username]) {
      delete conexionesActivas[username];
    }
  });

  connection.on('error', (error) => {
    console.error(`[${username}] error en la conexión de TikTok:`, error?.message || error);
  });

  try {
    await connection.connect();
    conexionesActivas[username] = connectionData;
    console.log(`✅ Conexión establecida con éxito para ${username}.`);
    return res.json({ success: true });
  } catch (error) {
    console.error(`❌ Error al conectar con ${username}:`, error?.message || error);

    try {
      await connection.disconnect();
    } catch (disconnectError) {
      console.warn(`⚠️ Error al desconectar la conexión fallida de ${username}:`, disconnectError?.message || disconnectError);
    }

    return res.status(500).json({ success: false, error: String(error?.message || error || 'Error desconocido') });
  }
});

app.get('/obtener-cola/:tiktokUser', (req, res) => {
  const username = String(req.params.tiktokUser || '').trim();

  if (!username || !conexionesActivas[username]) {
    console.log(`GET /obtener-cola/${username} -> no hay conexión activa, retornando cola vacía.`);
    return res.json([]);
  }

  const connectionData = conexionesActivas[username];
  const colaActual = [...connectionData.cola];
  connectionData.cola.length = 0;

  console.log(`GET /obtener-cola/${username} -> retornando cola:`, colaActual);
  return res.json(colaActual);
});

app.post('/desconectar-live', async (req, res) => {
  const { tiktokUser } = req.body;

  if (!tiktokUser || typeof tiktokUser !== 'string' || !tiktokUser.trim()) {
    return res.status(400).json({ success: false, error: 'tiktokUser es requerido y debe ser una cadena.' });
  }

  const username = tiktokUser.trim();
  const connectionData = conexionesActivas[username];

  if (!connectionData) {
    console.log(`POST /desconectar-live -> no existe conexión activa para ${username}.`);
    return res.status(400).json({ success: false, error: 'No existe una conexión activa para este usuario.' });
  }

  try {
    await connectionData.connection.disconnect();
    delete conexionesActivas[username];
    console.log(`✅ Conexión de ${username} desconectada con éxito.`);
    return res.json({ success: true });
  } catch (error) {
    console.error(`❌ Error al desconectar ${username}:`, error?.message || error);
    return res.status(500).json({ success: false, error: String(error?.message || error || 'Error al desconectar.') });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Express en ejecución en http://localhost:${PORT}`);
  console.log('Puerto configurado desde process.env.PORT || 3000.');
});
