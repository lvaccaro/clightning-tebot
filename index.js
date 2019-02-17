'use strict'

const crypto = require('crypto')
const fs = require('fs')
const LightningClient = require('lightning-client')
const TelegramBot = require('node-telegram-bot-api')
const qr = require('qr-image')
const request = require('request')
const QRReader = require('qrcode-reader')
const jimp = require('jimp')
const config = require('./config.json')
const packageJson = require('./package.json')

const bot = new TelegramBot(config.telegramToken, { polling: true })
const client = new LightningClient(config.lightningDir, true)

bot.onText(/\/help/, async msg => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const res = '<b>' + packageJson.name + ' v.' + packageJson.version + '</b>\n' +
    '<a href=\'' + packageJson.repository.url + '\'>' + packageJson.repository.url + '</a>\n' +
    `This software is for testing and demonstration purposes only. This software and c-lightning are still very new and contain known and unknown bugs. In particular, be warned: YOU MAY LOSE FUNDS!\n
\nCommands:\n
<b>/help</b>: Show help message\n
<b>/invoice msatoshi [label] [description] [expiry]</b>: Create an invoice for {msatoshi} with {label} and {description} with optional {expiry} seconds (default 1 hour). If {label} is not defined a random value will be generate. Default {description} is empty\n
<b>/decodepay bolt11 [description]</b>: Decode {bolt11}, using {description} if necessary\n
<b>/pay bolt11 [msatoshi]</b>: Send payment specified by {bolt11} with {msatoshi}\n
<b>/listinvoices [label]</b>: Show invoice {label} (or all, if no {label})\n
<b>/listpayments [bolt11] [payment_hash]</b>: Show outgoing payments\n
<b>/waitinvoice label</b>: Wait for an incoming payment matching the invoice with {label}, or if the invoice expires\n
<b>/waitanyinvoice [lastpay_index]</b>: Wait for the next invoice to be paid, after {lastpay_index} (if supplied)\n
If a qrcode image is send to the bot without any command, the bot call implicit <b>/decodepay</b>.\n`
  bot.sendMessage(chatId, res, { 'parse_mode': 'HTML' })
})

bot.onText(/\/info/, async msg => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const info = await client.getinfo()
  const res = 'id: ' + info.id + '\nalias: ' + info.alias + '\nnetwork: ' + info.network +
    '\nnum_peers: ' + info.num_peers +
    '\naddress: ' + info.address[0].address + ':' + info.address[0].port
  bot.sendMessage(chatId, res)
})

bot.onText(/\/listinvoices(.*)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const args = match[0].split(' ')
  try {
    const listinvoices = (args.length === 1) ? await client.listinvoices() : await client.listinvoices(args[1])
    const list = listinvoices.invoices.map(invoice => {
      return strInvoice(invoice)
    })
    console.log(list)
    if (list === '') {
      return bot.sendMessage(chatId, 'No invoice found')
    }
    const chunk = 5
    for (var i = 0; i < list.length; i += chunk) {
      bot.sendMessage(chatId, list.slice(i, i + chunk).join('\n'), { 'parse_mode': 'HTML' })
    }
  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, 'Error on retrieve list of invoices')
  }
})

bot.onText(/\/listpayments(.*)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  try {
    const args = match[0].split(' ')
    const listpayments = (args === 1) ? await client.listpayments() : await client.listpayments(args[1])
    console.log(JSON.stringify(listpayments))

    const list = listpayments.payments.map(pay => {
      return strPayment(pay)
    })
    console.log(list)
    if (list === '') {
      return bot.sendMessage(chatId, 'No payment found')
    }
    const chunk = 5
    for (var i = 0; i < list.length; i += chunk) {
      bot.sendMessage(chatId, list.slice(i, i + chunk).join('\n'), { 'parse_mode': 'HTML' })
    }
  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, 'Error on retrieve list of payments')
  }
})

bot.onText(/\/waitanyinvoice(.*)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  try {
    const args = match[0].split(' ')
    const invoice = (args.length === 1) ? await client.waitanyinvoice() : await client.waitanyinvoice(args[1])
    console.log(invoice)
    bot.sendMessage(chatId, strInvoice(invoice), { 'parse_mode': 'HTML' })
  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, 'Error on retrieve invoice')
  }
})

bot.onText(/\/waitinvoice(.*)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const args = match[0].split(' ')
  if (args.length === 1) {
    return bot.sendMessage(chatId, 'Invalid label')
  }
  try {
    const invoice = await client.waitinvoice(args[1])
    console.log(invoice)
    bot.sendMessage(chatId, strInvoice(invoice), { 'parse_mode': 'HTML' })
  } catch (error) {
    console.log(error)
    bot.sendMessage(chatId, 'Error on retrieve invoice')
  }
})

bot.onText(/\/invoice (.*)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const args = match[1].split(' ')
  console.log(args)
  if (args.length === 0 || (args[0] !== 'any' && isNaN(parseFloat(args[0])))) {
    return bot.sendMessage(chatId, 'Invalid amount')
  }
  const amount = args[0] === 'any' ? 'any' : parseFloat(args[0])
  const label = (args.length >= 2 && typeof args[1] === 'string') ? args[1] : crypto.randomBytes(20).toString('hex')
  const description = (args.length >= 3 && typeof args[2] === 'string') ? args[2] : ''
  const timeout = (args.length >= 4 && typeof args[3] === 'string' && !isNaN(parseInt(args[3]))) ? parseInt(args[3]) : 3600
  console.log(amount, label, description, timeout)
  try {
    const invoice = await client.invoice(amount, label, description, timeout)
    console.log(JSON.stringify(invoice))
    const { bolt11 } = invoice
    bot.sendMessage(chatId, bolt11)
    const qrImage = qr.imageSync(bolt11, { type: 'png' })
    bot.sendPhoto(chatId, qrImage)
  } catch (e) {
    const res = '<b>Error! code ' + e.error.code + '</b>\n' + '<i>' + e.error.message + '</i>\n'
    bot.sendMessage(chatId, res, { 'parse_mode': 'HTML' })
  }
})

bot.onText(/\/decodepay (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  if (match.length <= 1) {
    return bot.sendMessage(chatId, 'Invalid bolt11')
  }
  const bolt11 = match[1]
  const res = await decodepay(bolt11)
  bot.sendMessage(chatId, res, { 'parse_mode': 'HTML' })
})

async function decodepay (bolt11) {
  try {
    const decodepay = await client.decodepay(bolt11)
    console.log(JSON.stringify(decodepay))
    const msatoshi = decodepay.msatoshi !== undefined ? decodepay.msatoshi : 'any'
    return '<b>' + msatoshi + ' mSatoshi</b>\n' +
      '<i>' + decodepay.payment_hash + '</i>\n' +
      'Currency: ' + decodepay.currency + '\n' +
      'Description: ' + decodepay.description + '\n' +
      'Created: ' + new Date(decodepay.created_at * 1000) + '\n' +
      'Expiry: ' + (decodepay.expiry / 60) + 'min\n' +
      'Payee: ' + decodepay.payee + '\n' +
      'Signature: ' + decodepay.signature + '\n'
  } catch (e) {
    console.log(e)
    return '<b>Error! code ' + e.error.code + '</b>\n' + '<i>' + e.error.message + '</i>\n'
  }
}

bot.on('photo', async msg => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  if (msg.photo.length === 0) {
    return bot.sendMessage(chatId, 'Invalid photo')
  }
  const photo = msg.photo.pop()
  const file = await bot.getFile(photo.file_id)
  console.log(file)
  const url = 'https://api.telegram.org/file/bot' + config.telegramToken + '/' + file.file_path
  request.get({ url, encoding: null, responseType: 'buffer' }, async (err, httpResponse, body) => {
    if (err) {
      return bot.sendMessage(chatId, 'Error on downloading image: ' + url)
    }
    try {
      const buffer = Buffer.from(body, 'utf8')
      fs.writeFileSync(file.file_path, buffer)
    } catch (error) {
      return bot.sendMessage(chatId, 'Error on write file: ' + file.file_path)
    }
    const img = await jimp.read(fs.readFileSync(file.file_path))
    const qr = new QRReader()
    const value = await new Promise((resolve, reject) => {
      qr.callback = (err, v) => err !== null ? reject(err) : resolve(v)
      qr.decode(img.bitmap)
    })
    console.log(value)
    fs.unlinkSync(file.file_path)
    const bolt11 = value.result
    bot.sendMessage(chatId, bolt11)
    const res = await decodepay(bolt11)
    bot.sendMessage(chatId, res, { 'parse_mode': 'HTML' })
  })
})

bot.onText(/\/pay (.+)/, async (msg, match) => {
  const chatId = msg.chat.id
  if (msg.from.username !== config.username) {
    return bot.sendMessage(chatId, 'User not authorized')
  }
  const args = match[1].split(' ')
  if (args.length === 0) {
    return bot.sendMessage(chatId, 'Invalid bolt11')
  }
  const bolt11 = args[0]
  try {
    const isAny = args.length === 2 && !isNaN(parseFloat(args[1]))
    const pay = isAny ? await client.pay(bolt11, parseFloat(args[1])) : await client.pay(bolt11)
    console.log(JSON.stringify(pay))
    bot.sendMessage(chatId, strPayment(pay), { 'parse_mode': 'HTML' })
  } catch (error) {
    const res = '<b>Error! code ' + error.error.code + '</b>\n' + '<i>' + error.error.message + '</i>\n'
    return bot.sendMessage(chatId, res, { 'parse_mode': 'HTML' })
  }
})

function strInvoice (invoice) {
  return '<b>' + invoice.label + ' : ' + invoice.msatoshi + ' mSatoshi</b>\n' +
    '<i>' + invoice.payment_hash + '</i>\n' +
    'Description: ' + invoice.description + '\n' +
    'Status: ' + invoice.status + '\n' +
    'Expires: ' + new Date(invoice.expires_at * 1000) + '\n' +
    'Bolt11: ' + invoice.bolt11 + '\n' +
    'Pay index: ' + invoice.pay_index + '\n'
}

function strPayment (pay) {
  return '<b>Success! ' + pay.msatoshi + ' mSatoshi ( sent ' + pay.msatoshi_sent + ' mSatoshi)</b>\n' +
    '<i>' + pay.payment_hash + '</i>\n' +
    'ID: ' + pay.id + '\n' +
    'Destination: ' + pay.destination + '\n' +
    'Created: ' + new Date(pay.created_at * 1000) + '\n' +
    'Status: ' + pay.status + '\n' +
    'Preimage: ' + pay.payment_preimage + '\n'
}
