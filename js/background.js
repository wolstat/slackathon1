/* Michael Wolstat 2015 http://wolstat.com */

var _tsmSlackChromeExt = {
	init : function() { var self = this;
		self.updateStatus('init');
		self.rtmRequest = $.ajax({
			url: this.baseUrl+"rtm.start",
			type: "get",
			data:  {token:this.authToken},
			dataType: "json",
			error: function(){ self.updateStatus('badsession'); },
			success: function(response){
				self.rtmData = self.indexify(response);
				//console.log('rtmData: '+JSON.stringify( self.rtmData ));
				console.log('rtm: success');

				self.wss = new window.WebSocket( self.rtmData[ self.rtmData['0'] ] ); //wss
				self.wss.onopen = self.onopen;
				self.wss.onclose = self.onclose;
				self.wss.onmessage = self.onmessage;
				self.wss.send = self.send;

				self.userRequest = $.ajax({
					url: self.baseUrl+"users.list",
					type: "get",
					data:  {token:self.authToken},
					dataType: "json",
					error: function(){ self.updateStatus('usersfail'); },
					success: function(response2){
						self.userData = self.indexify(response2.members);
						//console.log("userData: "+JSON.stringify(response2));
						console.log("userData: success");
						self.channelRequest = $.ajax({
							url: self.baseUrl+"channels.list",
							type: "get",
							data:  {token:self.authToken},
							dataType: "json",
							error: function(){ self.updateStatus('channelsfail'); },
							success: function(response3){
								self.channelData = self.indexify(response3.channels);
								self.channelMember = [];
								self.memberInfo = [];
								//console.log(self.channelData);
								for (var key in self.channelData){
									var obj = self.channelData[key];
									if (obj.is_member){
										self.channelInfo = $.ajax({
											url: self.baseUrl+"channels.info",
											type:"get",
											data: {token:self.authToken,
													channel: obj.id},
											dataType: "json",
											error: function(){ self.updateStatus('channelsinfofail'); },
											success: function(response4){
												self.memberInfo.push(response4.channel);
											}
										})
									}
								}
								console.log('channelData: '+JSON.stringify(response3));
								console.log('channelData: success');
								_tsmSlackChromeExt.updateStatus('connected');
							}
						});
					}
				});
			}
		});
	},
	onopen : function () { //wss
	    console.log("Connection with server open.");
	},
	onclose : function () { //wss
	    console.log("Connection with server closed.");
	},
	send : function (message, channel) { //wss
		return "{'as_user':true,'type':'message','channel','"+channel+"', 'text':'"+message+"'}";
	},
	onmessage : function (evt) { //wss
	    var eObj = $.parseJSON(evt.data);
	    console.log("incoming message! --- "+evt.data);
	    //message filters: non-message, messages from self, and intial 'reply_to' messages
	    if ( eObj.type === 'message' && eObj.user !== _tsmSlackChromeExt.user && typeof eObj.reply_to === 'undefined' ) {
	    	_tsmSlackChromeExt.addToQueue(eObj);
	    	//replace message in existing channel with new one? log channel count?
	    } else if ( eObj.type === 'channel_marked' ) {
	    	_tsmSlackChromeExt.unmarkChannel( eObj.channel );
	    }
	},
	updateStatus : function( state ){
		var ct = ( this.messageCount < 1 ) ? "" : (this.messageCount + "");

		chrome.browserAction.setBadgeText({ text: ct+this.statuses[state].suffix });
		chrome.browserAction.setBadgeBackgroundColor({ color:this.statuses[state].color }); //[155, 139, 187, 255]
  	},
  	// push message to queue
	addToQueue : function( message ){
		var type = 'message'; //filter here for 'direct' & 'mention'
		//add flags for 'edited' and 'urgency'
		//also re-map edited data to 
		this.messageQueue.push(message);
		this.updateStatus('message');

  	},
  	// pull all messages from a read channel out of queue
	unmarkChannel : function( channel ){
		var mQ = this.messageQueue, 
		entry, result = [];
		for (entry in mQ) { if ( mQ[entry].channel !== channel ) {
			result.push( mQ[entry] );
		}}
		mQ = result;
  	},
  	user : 'U033Z49JK', //need to set dynamically
	authToken : "xoxp-3118431681-3135145631-4229637403-9444ae", //need to set dynamically
  	messageCount : 0, // init always has a "reply_to" message right away, hence -1
	baseUrl : "https://slack.com/api/",
	messageQueue : [],
	statuses : {
		badsession:{
			color:'#000',
			suffix:'!:!'
		},
		usersfail:{
			color:'#000',
			suffix:'!@!'
		},
		channelsfail:{
			color:'#000',
			suffix:'!#!'
		},
		unauthorized:{
			color:'#000',
			suffix:'!!!'
		},
		init:{
			color:'#000',
			suffix:'...'
		},
		disconnected:{
			color:'#000',
			suffix:'!!'
		},
		connected:{
			color:'#5BF',
			suffix:''
		},
		message:{
			color:'#F66',
			suffix:''
		},
		direct:{
			color:'#F00',
			suffix:'@'
		},
		mention:{
			color:'#F00',
			suffix:'#'
		}
	},
	//take array of objects and return same data with unique ID keys
	indexify : function( dataset, idField ) {
		//console.log("I am in phonecatFilters !!!!!!!!!"+allProj[0]._id);
		var idField = ( typeof idField === 'undefined' ) ? 'id' : idField; //unset idField defaults to 'id' 
		var entry, results = {};
		for (entry in dataset) {
			results[ dataset[entry][idField] ] = dataset[entry];
		}
		return results;
	}
};

_tsmSlackChromeExt.init();






