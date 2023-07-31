const listener = Deno.listen({
  port: 4444,
})

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ver 0.1 - http/https/tcp(connect)
const getResponse = () => {
  return encoder.encode([
    'HTTP/1.1 200 Connection Established',
    'Proxy-agent: Deno-http-proxy'].join('\r\n') + '\r\n\r\n')
}

const handleConnection = async (client: Deno.Conn) => {

}

for await (const client of listener) {
  !(async () => {
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

    await client.write(getResponse())
    client.readable.pipeTo(server.writable).catch(reason => console.error('[c>s]', reason))
    server.readable.pipeTo(client.writable).catch(reason => console.error('[s>c]', reason))

  })().catch(reason => {
    console.error(reason)
  })
}

/*
// ver 0.1 - https
const getResponse = () => {
  return encoder.encode([
                          'HTTP/1.1 200 Connection Established',
                          'Proxy-agent: Deno-Proxy',
                        ].join('\r\n') + '\r\n\r\n')
}

for await (const conn of listener) {
  // const [src, src2] = conn.readable.tee()
  // for await (const r of Deno.serveHttp(conn)) {}
  
  !(async () => {
    const reader = conn.readable.getReader()
    let c = await reader.read()
      .then(value => value.value)
    reader.releaseLock()

    const l1 = decoder.decode(c).split('\r\n').shift()
    const [method, host, proto] = l1.split(' ')
    console.log(method, host, proto)
    
    const url = new URL(`https://${host}`)
    const server = await Deno.connect({hostname: url.hostname, port: 443})
    console.log('connect to', server.remoteAddr)
    
    conn.write(getResponse())
    conn.readable.pipeTo(server.writable)
    server.readable.pipeTo(conn.writable)
   
  })()
}*/


/*
// ver 0.1 - http
Deno.serve({
  port: 4444,
}, async (req) => {
  const url = new URL(req.url)
  
  if (req.method === 'CONNECT') {
    return new Response('')
  }
  
  return await fetch(url.href, {
    headers: req.headers,
    method: req.method,
    body: req.body,
  })
})
*/


