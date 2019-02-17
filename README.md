## Telegram Bot for c-lightning
[![Build Status](https://travis-ci.org/lvaccaro/clightning-tebot.svg?branch=master)](https://travis-ci.org/lvaccaro/clightning-tebot)

Not Custodiant Telegram Bot to control lightning wallet based on [c-lightning](https://github.com/ElementsProject/lightning) implementation.

We discorage to use the bot without any access rules, specify the telegram username to interact with.

Some critical operation are not exported by Telegram Bot, as: fund new channel, close channel, withdraw, newaddress.

### Warning
This software is for testing and demonstration purposes only. This software and c-lightning are still very new and contain known and unknown bugs. In particular, be warned: YOU MAY LOSE FUNDS!

### Commands
* `/help`: Show help message
* `/invoice msatoshi [label] [description] [expiry]`: Create an invoice for {msatoshi} with {label} and {description} with optional {expiry} seconds (default 1 hour). If {label} is not defined a random value will be generate. Default `description` is empty.
* `/decodepay bolt11 [description]`: Decode {bolt11}, using {description} if necessary
* `/pay bolt11 [msatoshi]`: Send payment specified by {bolt11} with {msatoshi}
* `/listinvoices [label]`: Show invoice {label} (or all, if no {label})    
* `/listpayments [bolt11] [payment_hash]`: Show outgoing payments
* `/waitinvoice label`: Wait for an incoming payment matching the invoice with {label}, or if the invoice expires
* `/waitanyinvoice [lastpay_index]`: Wait for the next invoice to be paid, after {lastpay_index} (if supplied)

If a qrcode image is send to the bot without any command, the bot call implicit `/decodepay`.


### Install
In order to install all dependencies
```
npm install
```

### Setup
The configuration file `config.json` requires:
* **telegramToken**: telegram token of specified bot
* **lightningDir**: c-lightning directory
* **username**: replay only to telegram username

An configuration example file is available ad `config_example.json`

### Run
To run the bot in a single instances:
```
npm start
```
Run the bot as a daemon using pm2
```
npm install -g pm2
pm2 start ./index.js --name clightning-tebot
pm2 save
```