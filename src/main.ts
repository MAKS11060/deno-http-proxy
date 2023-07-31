const listener = Deno.listen({
  port: 4444,
})

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ver 0.1 - http/https/tcp(connect)
const getResponseHeaders = () => {
  return encoder.encode([
    'HTTP/1.1 200 Connection Established',
    'Proxy-agent: Deno-http-proxy'].join('\r\n') + '\r\n\r\n')
}

const handleConnection = async (client: Deno.Conn) => {
  const reader = client.readable.getReader()
  let c = await reader.read()
    .then(value => value.value)
  reader.releaseLock()

  const raw = decoder.decode(c)
  const r = raw.split('\r\n')
  const l1 = r.shift()
  const [method, host, proto] = l1.split(' ')
  // console.log(method, host, proto)

  if (method != 'CONNECT') {
    console.log(`${method} ${host} ${proto}`)
    const url = new URL(host)
    const server = await Deno.connect({
      hostname: url.hostname, port: url.protocol === 'https:' ? 443 : 80,
    })
      .then(server => {
        if (server.remoteAddr.transport == 'tcp') {
          console.log(`[connect/${server.remoteAddr.transport}] ${server.remoteAddr.hostname}:${server.remoteAddr.port} ${host}`)
        }
        return server
      })
      .catch(reason => {
        console.error(`[connect err] ${host}:${port}`, reason)
      })

    if (!server) return

    const writer = server.writable.getWriter()
    await writer.write(encoder.encode(raw)) // client rawHeader to server
    writer.releaseLock()
    server.readable.pipeTo(client.writable).catch(reason => console.error('[s=>c]', reason))
    return
  }

  const url = new URL(`https://${host}`)
  const port = Number(host.split(':').pop()) || 443
  const server = await Deno.connect({
    hostname: url.hostname, port,
  })
    .then(server => {
      if (server.remoteAddr.transport == 'tcp') {
        console.log(`[connect/${server.remoteAddr.transport}] ${server.remoteAddr.hostname}:${server.remoteAddr.port} ${host}`)
      }
      return server
    })
    .catch(reason => {
      console.error(`[connect err] ${host}:${port}`, reason)
    })

  if (!server) return

  server.setKeepAlive(r.find(v => v.toLowerCase() === 'proxy-connection: keep-alive'))

  await client.write(getResponseHeaders())
  server.readable.pipeTo(client.writable)
    .catch(reason => console.error('[s>c]', reason))
  client.readable.pipeTo(server.writable)
    .catch(reason => console.error('[c>s]', reason))
}

for await (const conn of listener) {
  handleConnection(conn).catch(reason => {
    console.error('conn', reason)
  })
}
