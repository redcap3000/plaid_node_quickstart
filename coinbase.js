const config = require('./coinbase.json');
//'use strict'
// hide this crap check for 'env' key first and foremost .... or load from json file?
if(typeof config.cbproKey != 'undefined' && typeof config.cbproSecret != 'undefined' && config.cbproPass != 'undefined'){

    const key = config.cbproKey;
    const secret = config.cbproSecret;
    const passphrase = config.cbproPass;
    
    const apiURI = 'https://api.pro.coinbase.com';
    const sandboxURI = 'https://api-public.sandbox.pro.coinbase.com';
    const CoinbasePro = require('coinbase-pro');
    const authedClient = new CoinbasePro.AuthenticatedClient(
        key,
        secret,
        passphrase,
        apiURI
    );
    cbObj = {}
    coinbaseAccountId = false
    cb_Orders = {}
    cb_tickers={}
    cbNoBTCMarkets=['OXT','LINK','ALGO']
    // these have lower fees (by half?)
    cbUSDCMarkets=['BTC','ETH','ZEC','BAT','DAI','GNT','MANA','LOOM','CVC','DNT']
    cbUSDCOnlyMarkets=[ 'GNT','MANA','LOOM','CVC','DNT' ]
    cb_errors=[]


    ordersCallback = function(e, r) {
        if (typeof e == 'undefined' || e == null || !e) {
            if (typeof r != 'undefined' && typeof r.body != 'undefined') {
                //console.log(JSON.parse(r.body))
                try {
                    var orders = JSON.parse(r.body)

                } catch (error) {
                    console.log('CoinbasePro holdsCallback json parse error')
                }
                if (typeof orders != 'undefined') {
                    // convert balance/availabe/hold to floats
                    var filtered = []
                    orders.map(function(o) {
                        filtered.push(o)
                    })
                    cbObj.orders = filtered
                    return filtered
                }else{
                    return []
                }
            }
        }else if(typeof e.data != 'undefined' && typeof e.data.message != 'undefined'){
        	cb_errors.push({date : new Date(),func: 'ordersCallback',msg: e.data.message})
        }
        return false
    }

    cbOrderActionCallback = function(e, r) {
        if (typeof e == 'undefined' || e == null || !e) {
            if (typeof r != 'undefined' && typeof r.body != 'undefined') {
                try {
                    var cbOrder = JSON.parse(r.body)
                    console.log("CB ORDER")
                    console.log(cbOrder)
                    return true
                } catch (error) {
                    console.log('CoinbasePro cbOrderAction json parse error')
                }

            }else if(typeof r.body != 'undefined'){
            	console.log("Issue with order???")
    			console.log(r.body)
            }
        }else if(typeof e.data != 'undefined' && typeof e.data.message != 'undefined'){
        	cb_errors.push({date : new Date(),func: 'cbOrderActionCallback',msg: e.data.message})
        	
        }
        return false
    }
    cbPaymentMethodsCallback = function(e,r) {

        if (typeof e == 'undefined' || e == null || !e) {
            if (typeof r != 'undefined' && typeof r.body != 'undefined') {
                console.log('paymentMethodsCallback')
                console.log(r.body)
                //try {
                    var cbPaymentMethods = JSON.parse(r.body)
                    if(cbPaymentMethods.length === 1){
                        var pMethod = cbPaymentMethods[0]
                 

                        if(pMethod.type == 'ach_bank_account' && (pMethod.currency == 'USD' || pMethod.currency == 'usd')
                             && pMethod.allow_deposit && pMethod.verified){
                             console.log(this.amount)
                            if(typeof this.amount != 'undefined'){
                                console.log('pMETHOD PASSES ATTEMPTING withdrawPayment')
                                authedClient.withdrawPayment({amount:this.amount,currency:'USD',payment_method_id:pMethod.id},function(e,r){
                                    console.log("AUTHED CLIENT DEPOSITING " + this.amount )
                                    console.log(e)
                                    console.log(r)
                                }) 
                            }
                        }
                    }
                    // authedClient.depositPayment({amount:this.amount,currency:'USD'}) 

                    return true
                //} catch (error) {
                //    console.log('CoinbasePro cbOrderAction json parse error')
                //}

            }else if(typeof r.body != 'undefined'){
                console.log("Issue with cbPaymentMethods???")
                console.log(r.body)
            }
        }else if(typeof e.data != 'undefined' && typeof e.data.message != 'undefined'){
            cb_errors.push({date : new Date(),func: 'cbPaymentMethodsCallback',msg: e.data.message})
            
        }
        return false
    }
    /*
    // Buy 1 LTC @ 75 USD
    const params = {
      side: 'buy',
      price: '75.00', // USD
      size: '1', // LTC
      product_id: 'LTC-USD',
    };
    authedClient.placeOrder(params, callback);
    */
    var depositUSD = function(amount){
        authedClient.getPaymentMethods(cbPaymentMethodsCallback.bind({amount:amount}))
            
    }
    var getPaymentMethods = function(){
    }

    //marketDumpAll and payout function?
    module.exports = {
        cbCancelOrder: function(orderId) {
            if (typeof orderId == 'undefined') {
                return authedClient.cancelOrders(cbOrderActionCallback)
            }
            return authedClient.cancelOrder(orderId, cbOrderActionCallback)
        },
        depositUSD: function(amount){
            // deposits USD amount to banking option
            return depositUSD(amount)
        },
        transfer_from_cb: function(cbWalletId,amount){
            // deposit get currency from wallet info
            var validWallet = false
            cbObj.accounts.filter(function(a){
                    if(validWallet === false && a.id === cbWalletId){
                        validWallet = a
                    }
            })
            if (validWallet){
                // perform transfer
            }
                //step 1) verify amount exists on cb
                // if no amount transfer all


        },
        transfer_to_cb: function(cbWalletId,amount,forceAll){

                //step 1) verify amount exists on cb_pro
                /// add 'force transfer all' option to close orders to transfer entire balance
        },
        buy: function(obj) {
            product_id = obj.product_id
            price = obj.price
            siz = obj.amount
            return authedClient.placeOrder({
                side: 'buy',
                price: price + '',
                size: size + '',
                product_id: product_id
            }, cbOrderActionCallback)
        },
        sell: function(obj) {
            //product_id = obj.product_id
            //price = obj.price
            //size = obj.amount
            console.log("SELL " + obj.product_id)
            console.log(obj)
            obj.side = 'sell'
            authedClient.placeOrder(obj, cbOrderActionCallback)
        	return true
        },
        wallets: function() {
            var r = []
            //return  cbObj.accounts
            if (typeof cbObj.accounts != 'undefined' && cbObj.accounts.length > 0) {
                cbObj.accounts.filter(function(a) {
                    //console.log(a)
                    if (parseFloat(a.balance) > 0) {
                        var b = {
                            id: a.id,
                            currency: a.currency,
                            amount: parseFloat(a.balance),
                            available: parseFloat(a.available)

                        }
                        r.push(b)
                    }
                })
            
            return cbObj.accounts
            }
            return false
        },
        orders: function() {
            // filter out extra fields ... 
            var f = []
            if (typeof cb_Orders != 'undefined' && cb_Orders.length > 0) {
                cb_Orders.filter(function(o) {
                    var newO = {
                        id: o.id,
                        price: o.price,
                        amount: o.size,
                        product_id: o.product_id,
                        side: o.side,
                        created_at: o.created_at

                    }
                    f.push(newO)
                })
                return f
            }
            return []
        },
        errors: function(){
        	// add filter for count or date
        	return cb_errors
        },
        cbLoopFunction: function(buyO, sellO) {
            //authedClient.getCoinbaseAccounts(cbAccountsCallback);
            /*
                    IN USE 1/2020
            */
            //console.log('cb')
               //authedClient.getCoinbaseAccounts(cbAccountsCallback2)
            authedClient.getAccounts(function(e, r) {
                //console.log('authed client')
                //console.log(e)
                if (typeof e == 'undefined' || e == null || !e) {
                    if (typeof r != 'undefined' && typeof r.body != 'undefined') {
                        try {
                            var cbAccountsT = JSON.parse(r.body)
                        } catch (error) {
                            console.log('CoinbasePro accountsCallback json parse error')
                        }
                        if (typeof cbAccountsT != 'undefined') {
                            // convert balance/availabe/hold to floats
                            var filtered = []
                            cbAccountsT.map(function(o) {
                                if (typeof coinbaseAccountId == 'undefined') {
                                    coinbaseAccountId = o.profile_id
                                }
                                var holdCheck = parseFloat(o.hold)
                                var availableCheck = parseFloat(o.available)
                                if (holdCheck > 0 || availableCheck) {

                                
                                    var o2 = {}
                                    o2.currency = o.currency
                                    o2.balance = parseFloat(o.balance)
                                    o2.available = parseFloat(o.available)
                                    o2.hold = parseFloat(o.hold)
                                    o2.id = o.id
                                    filtered.push(o2)
                                }

                            })
                            // next check orders and apply logic
                            if (filtered.length > 0) {
                                authedClient.getOrders({ status: 'open' }, function(e, r) {
                                    if (typeof r != 'undefined' && typeof r.body != 'undefined') {
                                        try {
                                            var orders = JSON.parse(r.body)
                                            if (orders.length > 0) {
                                                cb_Orders = orders
                                                if (cb_Orders.length > 0) {
                                                    if (typeof buyO != 'undefined' && typeof sellO != 'undefined') {
                                                        orders.filter(function(order) {

                                                            if (order.side == 'sell') {
                                                                if (order.product_id == sellO.product_id) {

                                                                    if (parseFloat(order.price) == sellO.price) {
                                                                        /*
                                                                           DO NOTHING OR OTHER ORDER CANCELATION/MODIFICATION EVENT

                                                                        */
                                                                        console.log("PRODUCT/PRICE/ORDER MATCHES")
                                                                    } else {
                                                                        /*
                                                                        	NOT SURE PROBABLY CANCEL ORDER AND PLACE
                                                                        */

                                                                        console.log("PRODUCT MATCHES BUT ORDER DIFFERENT")
                                                                        console.log("CANCEL ORDER")
                                                                        var orderCancel = cbCancelOrder(order.id)
                                                                        setTimeout(function() {
                                                                            // place order
                                                                            sell(sellO.product_id, sellO.price, sellO.amount)
                                                                        }, 1000)
                                                                    }
                                                                } else {
                                                                    /* CANCEL ALL ORDERS AND PLACE DETERMINE TO PLACE
                                                                    BUY /SELL ORDER BASED ON AVAILABLE HOLDINGS */
                                                                    console.log("SOME OTHER PRODUCT ORDER EXISTS")
                                                                }
                                                            }
                                                        })

                                                        if (buyO.product_id === sellO.product_id) {
                                                            //authedClient.getFills({product_id: buyO.product_id}, function(e,r){
                                                            //	console.log(e)
                                                            //	console.log(r)
                                                            //});
                                                        }
                                                    }
                                                }
                                            } else {
                                                /*
                                                	no orders present. probably should be the initial state
                                                	will check (first) to see if the sell order can be placed
                                                	if not should then check if the buy order can be placed
                                                	otherwise the order needs to be reworked based on what is available
                                                */
                                                // check fills ?
                                                /*
                                                if(buyO.product_id === sellO.product_id){
                                                	authedClient.getFills({product_id: buyO.product_id}, function(e,r){
                                                		console.log(e)
                                                		console.log(r)
                                                	});
                                                }
                                                */
                                                if (typeof buyO != 'undefined' && typeof sellO != 'undefined' && typeof sellO.product_id != 'undefined' && buyO.product_id != 'undefined') {
                                                    cbAccounts.map(function(o) {
                                                        var availableBalance = parseFloat(o.available)
                                                        if (availableBalance) {
                                                            //console.log(o)
                                                            //console.log(sellO)
                                                            var baseMarket = o.currency
                                                            if (typeof sell_o.product_id != 'undefined') {
                                                                if (o.currency == sellO.product_id.split('-')[0]) {
                                                                    //console.log( sellO.amount + '::::' +o.currency + ' ' + availableBalance)

                                                                    if (availableBalance > sellO.amount || availableBalance == sellO.amount) {
                                                                        // will want to check how fees are handled and if this will fail if doing max/amount
                                                                        /* PLACE SELL ORDER */
                                                                        canSell = baseMarket
                                                                        //console.log("CAN PLACE SELL ORDER")
                                                                        sell(sellO.product_id, sellO.price, sellO.amount)
                                                                    } else {
                                                                        console.log('***\t' + baseMarket + '\t not enough balance for sell order : ' + sellO.amount)
                                                                        buy(buyO.product_id, buyO.price, buyO.amount)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    })
                                                }
                                                if (canSell) {
                                                    console.log("FOLLOW UP ON SELL ORDER HERE for " + canSell)
                                                    console.log(sellO)
                                                } else if (typeof cbAccounts != 'undefined') {
                                                    // check if you can place buy order
                                                    //console.log(buyO)
                                                    cbAccounts.map(function(o) {
                                                        var availableBalance = parseFloat(o.available)
                                                        if (availableBalance) {
                                                            //console.log(o)
                                                            //console.log(sellO)
                                                            var baseMarket = o.currency
                                                            if (typeof buyO != 'undefined') {
                                                                if (o.currency == buyO.product_id.split('-')[1]) {
                                                                    if (availableBalance > buyO.amount || availableBalance === buyO.amount) {
                                                                        console.log("YOU HAVE FUNDS TO PLACE BUY ORDER I THINK?!?!")
                                                                        buy(buyO.product_id, buyO.price, buyO.amount)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    })
                                                }else{
                                                    //console.log("cbAccounts is undefined")
                                                }
                                            }
                                        } catch (error) {
                                            console.log('CoinbasePro getOrders json parse error')
                                            console.log(error)
                                        }
                                    }
                                })
                                // determine if the current order books represent the dfined orders ?
                            } else {
                                /*
                                	NO ORDERS PRESENT PLACE ORDER BASED ON AVAILABLE HOLDINGS
                                */
                                // check if btc is available
                                // determine wether to execute buy / sell based on available funds
                                if (typeof buyO != 'undefined' && typeof sellO != 'undefined') {
                                    var canSell = false
                                    var canBuy = false
                                    cbAccountsT.map(function(o) {
                                        var availableBalance = parseFloat(o.available)
                                        if (availableBalance) {

                                            var baseMarket = o.currency
                                            if (o.currency == sellO.product_id.split('-')[0]) {

                                                if (availableBalance > sellO.amount || availableBalance == sellO.amount) {
                                                    // will want to check how fees are handled and if this will fail if doing max/amount
                                                    /* PLACE SELL ORDER */
                                                    canSell = baseMarket
                                                } else {
                                                    console.log('***\t' + baseMarket + '\t not enough balance for sell order : ' + sellO.amount)
                                                }
                                            }

                                        }
                                    })
                                    // attemp to place the buy order
                                    if (!canSell) {
                                        console.log("cant sell")
                                        // figure out if account has the money to buy the product
                                        var subMarket = buyO.product_id.split('-')[1]
                                        cbAccountsT.map(function(o) {
                                            if (o.currency == subMarket) {
                                                console.log("MATCH")
                                                console.log(o.available)
                                            }
                                        })
                                    }
                                }
                            }
                            //console.log(filtered)
                            // this will auto deposit primary btc wallet
                          
                            filtered.filter(function(f){
                                // to do notStableCoin function
                                if(f.currency != 'USD' && f.currency != 'DAI' && f.currency != 'USDC' ){
                                    var curr = (f.currency != 'BTC' ? f.currency+'-BTC' : 'BTC-USD')
                                    var curCk = curr.split('-')
                                    if(cbNoBTCMarkets.indexOf(curCk[0]) > -1 ){

                                        // hack for OXT market which does not have a BTC market (WHY?)
                                        // probably expand to arrayFind to support other similar markets
                                        curr = curCk[0]+'-USD'
                                    }
                                      authedClient.getProductTicker(curr,function(e,r){
                                        if(typeof e == null || typeof e == 'undefined' || !e){
                                            if(typeof r != 'undefined' && typeof r.body != 'undefined'){
                                                try{
                                                    var cbTicker = JSON.parse(r.body)
                                                }catch(err){
                                                    console.log('JSON error - cb - getProductTicker')
                                                }
                                                if(typeof cbTicker != 'undefined' && cbTicker && typeof cbTicker.price != 'undefined'){
                                                    cb_tickers[curr] = parseFloat(cbTicker.price)
                                                }
                                            }
                                        }
                                    })
                                }
                            })

                            cbObj.accounts = filtered
                            return filtered
                        }else{
                            console.log('massive error')
                        }
                        // get regular cb accounts here
                     
                    }
                }else{
                    console.log('e had a value?')
                }
                return false
            })


        },
        tickers: function(){
            return cb_tickers
        }
    }

}else{
    console.log("CoinbasePro cred. not found.")
}
//console.log("about to deposit...")
//depositUSD('46.90')
//authedClient.getAccounts(cbAccountsCallback);
//console.log(authedClient.getOrders({ status: 'open'},ordersCallback.bind(this)))
//cbCancelOrder()
//console.log(authedClient.getOrders({ status: 'open'},ordersCallback.bind(this)))
//buy('XRP-USD',0.3173,84)
//authedClient.getOrders({ status: 'open'},ordersCallback)