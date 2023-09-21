import cors from "cors"
import { config as dotenvConfig } from "dotenv"
import express from "express"
import https from "https"
import { resolve } from "path"
import fs from "fs"
import { VivoxToken, ChannelType } from "vivox-token"

function stringIsNullOrEmpty(str) {
  return !str || str.length === 0
}

function setupProcessEnv() {
  dotenvConfig({ path: resolve(__dirname, "./.env") })
}

function setupPort(): string {
  if (typeof process.env.SERVER_URL !== "string") {
    throw new Error("Please, define SERVER_URL in your .env file")
  }
  const { port } = new URL(process.env.SERVER_URL)

  return port
}

function setupSecureServer(port: string) {
  const app = express()
  // config server to use https
  const keyDir = process.argv[2]
  const certDir = process.argv[3]
  let _key: Buffer = Buffer.alloc(0)
  let _cert: Buffer = Buffer.alloc(0)
  const secure: boolean = !stringIsNullOrEmpty(keyDir) && !stringIsNullOrEmpty(certDir)
  if (secure) {
    if (!fs.existsSync(keyDir) || !fs.existsSync(certDir)) {
      throw new Error("Cannot start server in secure mode without private key or certificate files")
    }

    _cert = fs.readFileSync(certDir)
    _key = fs.readFileSync(keyDir)

    console.log(`secure server: ${secure}, key: ${keyDir}, cert: ${certDir}`)
  }

  let server: https.Server
  if (secure)
    server = https.createServer({ key: _key!, cert: _cert! }, app)

  if (secure && !process.env.SERVER_URL!.startsWith("https")) {
    throw new Error("you cannot start the server in secure mode while the .env server address is simple http")
  }
  if (!secure && process.env.SERVER_URL!.startsWith("https")) {
    throw new Error("you cannot start the server in insecure mode while the .env server address is set to https")
  }

  if (secure) {
    server!.listen(port, () => {
      console.info(`Started HTTPS server API at ${process.env.SERVER_URL}/`)
    })
  } else {
    app.listen(port, () => {
      console.info(`Started HTTP server API at ${process.env.SERVER_URL}/`)
    })
  }

  return { app }
}

function setupExpressPlugins(app: any) {
  app.use(cors())
  app.use(express.json())
}

function setupVivoxToken() {
  const issuer      = process.env.ISSUER
  const secretKey   = process.env.SERCRET_KEY
  const domain      = process.env.DOMAIN
  const adminUserID = process.env.ADMIN_USER_ID

  return new VivoxToken(issuer!, secretKey!, domain!, adminUserID!);
}
const main = async () => {
  setupProcessEnv()
  const port = setupPort()
  const { app } = setupSecureServer(port)
  setupExpressPlugins(app)
  const vivoxToken = setupVivoxToken()

  app.post("/createToken", async (req, res) => {
    const tokenRequest = req.body
    try {
      let token: string = ""
      switch (tokenRequest.type) {
        case 'login':
          token = vivoxToken.login(tokenRequest.userId)
          console.log(`created login token: ${token}`)
          break;
        case 'join':
          token = vivoxToken.join(tokenRequest.userId, ChannelType.NonPositionalChannels, tokenRequest.channelID)
          console.log(`created join token: ${token}`)
          break;

        // TODO add support for other vivox actions like joinMuted, etc.
        default:
          break;
      }

      res.setHeader("Access-Control-Expose-Headers", "token")
      res.setHeader("token", token).status(200).end()
    } catch (error: any) {
      console.error(error)
      res.status(500).end()
    }
  })
}

main()