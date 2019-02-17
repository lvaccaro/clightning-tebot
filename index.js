'use strict';

const LightningClient = require('lightning-client')
const TelegramBot = require('node-telegram-bot-api')
const qr = require('qr-image')
const crypto = require("crypto")
const request = require('request')
const QRReader = require('qrcode-reader')
const jimp = require('jimp')
const fs = require('fs')
const config = require('./config.json')
const packageJson = require('./package.json');

const bot = new TelegramBot(config.telegramToken, {polling: true})
const client = new LightningClient(config.lightningDir, true);

bot.onText(/\/help/, async (msg) => {
	const chatId = msg.chat.id
	const res = "<b>" + packageJson.name + " v." + packageJson.version +"</b>\n" +
		"<a href='" + packageJson.repository.url + "'>" + packageJson.repository.url + "</a>\n" +
		"This software is for testing and demonstration purposes only. This software and c-lightning are still very new and contain known and unknown bugs. In particular, be warned: YOU MAY LOSE FUNDS!"
	bot.sendMessage(chatId, res, { 'parse_mode': 'HTML'})
})

bot.onText(/\/info/, async (msg) => {
	const chatId = msg.chat.id
	const info = await client.getinfo()
	const res = "id: " + info.id + "\nalias: " + info.alias + "\nnetwork: " + info.network +
	"\nnum_peers: " + info.num_peers +
	"\naddress: " + info.address[0]["address"] + ":" + info.address[0]["port"]
	bot.sendMessage(chatId, res)
})

bot.onText(/\/listinvoices/, async (msg) => {
	const chatId = msg.chat.id
	try {
		const listinvoices = await client.listinvoices()
		const res = listinvoices.invoices.map( (invoice) => {
			return "<b>" + invoice.label + " : " + invoice.msatoshi + "mSatoshi</b>\n" +
					"<i>" + invoice.payment_hash + "</i>\n" +
					"Description: " + invoice.description + "\n" +
					"Status: " + invoice.status + "\n" +
					"Expires: " + new Date(invoice.expires_at * 1000) + "\n" +
					"Bolt11: " + invoice.bolt11 + "\n"
		}).join('\n')
		bot.sendMessage(chatId, res, { 'parse_mode': 'HTML'})
	} catch (e) {
		console.log(e)
		bot.sendMessage(chatId, "Error on retrieve list of invoices")
	}
})

bot.onText(/\/listpayments/, async (msg) => {
	const chatId = msg.chat.id
	try {
		const listpayments = await client.listpayments()
		console.log(JSON.stringify(listpayments))
		bot.sendMessage(chatId, JSON.stringify(listpayments))
	} catch (e) {
		console.log(e)
		bot.sendMessage(chatId, "Error on retrieve list of payments")
	}
})

bot.onText(/\/invoice ([^\s]+) ([^\s]+) ([^\s]+)/, async (msg, match) => {
	const chatId = msg.chat.id
	console.log(match)

	const amount = parseFloat(match[1])
	if (isNaN(amount)) {
		return bot.sendMessage(chatId, "Invalid amount")
	}
	const label = (match.counts >= 2 && match[2] instanceof String) ? match[2] : crypto.randomBytes(20).toString('hex')
	const description = (match.counts >= 3 && match[3] instanceof String) ? match[3] : ""
	const timeout = (match.counts >= 4 && match[4] instanceof String && !isNan(parseInt(match[4]))) ? parseInt(match[4]) : 3600
	try {
		const invoice = await client.invoice(amount, label, description, timeout)
		console.log(JSON.stringify(invoice))
		const bolt11 = invoice.bolt11
		bot.sendMessage(chatId, bolt11)
		const qrImage = qr.imageSync(bolt11, { type: 'png' })
		bot.sendPhoto(chatId, qrImage)
	} catch (e) {
		console.log(e)
		bot.sendMessage(chatId, "Error on invoice")
	}
})

bot.onText(/\/decodepay (.+)/, async (msg, match) => {
	const chatId = msg.chat.id
	console.log(match)
	if (match.counts <= 1)
		return bot.sendMessage(chatId, "Invalid bolt11")
	const bolt11 = match[1]
	try {
		const decodepay = await client.decodepay(bolt11)
		console.log(JSON.stringify(decodepay))
		const res = "<b>" + decodepay.msatoshi + "mSatoshi</b>\n" +
			"<i>" + decodepay.payment_hash + "</i>\n" +
			"Currency: " + decodepay.currency + "\n" +
			"Description: " + decodepay.description + "\n" +
			"Created: " + new Date(decodepay.created_at * 1000) + "\n" +
			"Expiry: " + decodepay.expiry / 60 + "min\n" +
			"Payee: " + decodepay.payee + "\n" +
			"Signature: " + decodepay.signature + "\n"
		bot.sendMessage(chatId, res, { 'parse_mode': 'HTML'})
	} catch (e) {
		console.log(e)
		bot.sendMessage(chatId, "Invalid decode bolt11")
	}
})

bot.on('photo', async (msg) => {
	console.log(msg)
	const chatId = msg.chat.id
	if (msg.photo.count == 0)
		return bot.sendMessage(chatId, 'Invalid photo')
	const photo = msg.photo.pop()
	const file = await bot.getFile(photo.file_id)
	console.log(file)

	const url = "https://api.telegram.org/file/bot" + config.telegramToken +"/" + file.file_path
	request.get({url: url, encoding: null, responseType: 'buffer'}, async function (err, httpResponse, body) {
		if (err)
			return bot.sendMessage(chatId, "Error on downloading image: " + url)
		try {
			const buffer = Buffer.from(body, 'utf8')
			fs.writeFileSync(file.file_path, buffer)
		} catch (e) {
			return bot.sendMessage(chatId, "Error on write file: " + file.file_path)
		}
		const img = await jimp.read(fs.readFileSync(file.file_path))
		const qr = new QRReader()
		const value = await new Promise((resolve, reject) => {
			qr.callback = (err, v) => err != null ? reject(err) : resolve(v)
			qr.decode(img.bitmap)
		})
		console.log(value)
		fs.unlinkSync(file.file_path)
		bot.sendMessage(chatId, value.result)
	})
})

bot.onText(/\/pay (.+)/, async (msg, match) => {
	const chatId = msg.chat.id
	console.log(match)
	if (match.counts <= 1)
		return bot.sendMessage(chatId, "Invalid bolt11")
	const bolt11 = match[1]
	try {
		const pay = await client.pay(bolt11)
		console.log(JSON.stringify(pay))

		var res = ""
		if pay.hasOwnProperty("code") {
			res = "<b>Error! code " + pay.code + "</b>\n" +
				"<i>" + pay.message + "</i>\n"
		} else {
			res = "<b>Success! " + pay.msatoshi_sent + "mSatoshi sent</b>\n" +
				"<i>" + pay.payment_hash + "</i>\n" +
				"ID: " + pay.id + "\n" +
				"Destination: " + pay.destination + "\n" +
				"Timestamp: " + new Date(pay.timestamp * 1000) + "\n" +
				"Created: " + new Date(pay.created_at * 1000) + "\n" +
				"Status: " + pay.status + "\n" +
				"Preimage: " + pay.payment_preimage + "\n"
		}
		bot.sendMessage(chatId, res, { 'parse_mode': 'HTML'})
	} catch (e) {
		return bot.sendMessage(chatId, "Error on write file: " + file.file_path)
	}
})