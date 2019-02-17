## Telegram Bot for c-lightning

Telegram Bot to control lightning wallet based on [c-lightning](https://github.com/ElementsProject/lightning) implementation.

We discorage to use the bot without any access rules.

Some critical operation are not exported by Telegram Bot as: fund new channel, close channel, withdraw, newaddress.

### Warning
This software is for testing and demonstration purposes only. This software and c-lightning are still very new and contain known and unknown bugs. In particular, be warned: YOU MAY LOSE FUNDS!

### Commands
* `/help`: The help message
* `/invoice msatoshi label description timeout`: generate a new invoice of msatoshi amount and create the qrcode image. If label is not defined a random value will be generate. Default description is empty. Default timeout is 1 hour.
* `/decodepay bolt11`: decode a bolt11 receipt with amount, expired time, etc..
* `/pay bolt11`: pay a bolt11 receipt
* `/listinvoices`: list of all generated invoices
* `/listpayments`: list of all received payments

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
```