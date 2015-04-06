/* Michael Wolstat 2015 http://townsquaredigital.com */

//TODO: initial auth workflow
//TODO: new session call to fetch the token out of our db
//TODO: logic to detect a stale session and restart
//TODO: the user's id will have to be stored locally with the extension
//TODO: updateBadge needs to calculate status, not be passed it
//TODO: deeplink to channel https://tsmproducts.slack.com/messages/collab-room/
//TODO: know when popup hides, shows - reset state?
//TODO: know when browser starts - init session

var _tsmSlackChromeExt = {
	init : function() { var self = this;
		self.updateBadge('init');
		self.rtmRequest = $.ajax({
			url: this.baseUrl+"rtm.start",
			type: "get",
			data:  {token:this.authToken},
			dataType: "json",
			error: function(){ self.updateBadge('badsession'); },
			success: function(response){
				self.rtmData = self.indexify(response);
				console.log('rtmData: '+JSON.stringify( self.rtmData ));
				self.log('rtm: success');
				self.filters = self.rtmData[ self.user ].prefs.highlight_words;
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
					error: function(){ self.updateBadge('usersfail'); },
					success: function(response2){
						self.userData = self.indexify(response2.members);
						//_tsmSlackChromeExt.log("userData: "+JSON.stringify(response2));
						_tsmSlackChromeExt.log("userData: success");
						self.channelRequest = $.ajax({
							url: self.baseUrl+"channels.list",
							type: "get",
							data:  {token:self.authToken},
							dataType: "json",
							error: function(){ self.updateBadge('channelsfail'); },
							success: function(response3){
								self.channelData = self.indexify(response3.channels);
								self.channelMember = [];
								self.memberInfo = [];
								//_tsmSlackChromeExt.log('channelData: '+JSON.stringify(response3));
								_tsmSlackChromeExt.log('channelData: success');
								//_tsmSlackChromeExt.log(self.channelData);
								for (var key in self.channelData){
									var obj = self.channelData[key];
									if (obj.is_member){
										self.channelInfo = $.ajax({
											url: self.baseUrl+"channels.info",
											type:"get",
											data: {token:self.authToken,
													channel: obj.id},
											dataType: "json",
											error: function(){ self.updateBadge('channelsinfofail'); },
											success: function(response4){
												self.memberInfo.push(response4.channel);
								//console.log("self.channelMember "+JSON.stringify(self.channelMember));
								_tsmSlackChromeExt.log("response4.channel.unread_count "+JSON.stringify(response4.channel.unread_count));
											}
										})
									}
								}
								//self.switchPanel('convo');
								//console.log("self.channelMember "+JSON.stringify(self.channelMember));
								//console.log("self.memberInfo "+JSON.stringify(self.memberInfo));
							}
						});
					}
				});
			}
		});
	},
	onopen : function () { //wss
		_tsmSlackChromeExt.updateBadge('connected');
	    _tsmSlackChromeExt.log("Connection with server open.");
	},
	onclose : function () { //wss
		_tsmSlackChromeExt.updateBadge('disconnected');
		_tsmSlackChromeExt.switchPanel('prefs');
	    _tsmSlackChromeExt.log("Connection with server closed.");
	},
	send : function (message, channel) { //wss
		return "{'as_user':true,'type':'message','channel','"+channel+"', 'text':'"+message+"'}";
	},
	onmessage : function (evt) { //wss
	    var eObj = $.parseJSON(evt.data);
	    _tsmSlackChromeExt.log("--- evt.data "+evt.data);
	    //message filters: non-message, messages from self, and intial 'reply_to' messages
	    // && eObj.user !== _tsmSlackChromeExt.user
	    if ( eObj.type === 'message' && typeof eObj.reply_to === 'undefined' ) {
	    	_tsmSlackChromeExt.addToQueue(eObj);
	    	//replace message in existing channel with new one? log channel count?
	    } else if ( eObj.type === 'channel_marked' ) {
	    	_tsmSlackChromeExt.unmarkChannel( eObj );
	    	_tsmSlackChromeExt.updateBadge('message');
	    }
	    _tsmSlackChromeExt.displayPanel('convo');
	},
	updateBadge : function( state ){
		//check urgency statuses
		this.log('updateBadge '+state);
		var mCt = this.messages.length;
		var ct = ( mCt < 1 ) ? "" : (mCt + "");

		chrome.browserAction.setBadgeText({ text: ct+this.statuses[state].suffix });
		chrome.browserAction.setBadgeBackgroundColor({ color:this.statuses[state].color }); //[155, 139, 187, 255]
  	},
  	// push message to queue
	addToQueue : function( message ){ var self = this;
		var type = 'message', m = {};
		self.incrementConvo( message.channel );
		self.messages.push(message);
		self.updateBadge(type);
		console.log("messages"+JSON.stringify(self.messages));
  	},
	incrementConvo: function( ch ){ var self = this; //update convo obj and messageCount
		if ( self.convos.indexOf( ch ) === -1 ) {
			self.convos[ ch ] = 1;
		} else {
			self.convos[ ch ]++;
		}
	},
  	// pull all messages from a read channel out of queue
	unmarkChannel : function( obj ){
		//this.has_mention = false;
		//this.has_match = false;
		var mQ = this.messages, newQ = [],
		i, channel = obj.channel;
		for (i = 0;i<mQ.length;i++) { 
			this.log("unmark loop i:"+i+" :: "+JSON.stringify(mQ));
			if ( mQ[i].channel !== channel ) {
				newQ.push(mQ[i]); //delete message from queue
			} else { //check kept messages for urgency
				this.urgencyCheck( mQ[i] );
			}
		}
		//clear self.convos
		//this.urgencyCheck();
		this.messages = newQ;
  	},
  	//check message for any filter matches or <@uid> mentions
  	urgencyCheck : function( message ){
  		//loop here checking for filter matches or <@uid> mentions
		//also re-map edited data to 
		return true;
		//this.has_mention = true;
		//this.has_match = true;
  	},
  	// html switch panel
	displayPanel : function( clicked ){
		var jQ = _tsmSlackChromeExt.jQ;
		_tsmSlackChromeExt.activePanel = clicked;
		if ( jQ ) {
			var entry, result = [];
			jQ("#sections > section").each(function( ind, el ){
				if ( el.id === clicked ) {
					jQ( el ).show();
					_tsmSlackChromeExt.initPanel(clicked);
				} else {
					jQ( el ).hide();
				}
			});
		}
  	},
	initPanel : function( panel ){
		switch( panel ) {
			case "sm":
				var smdata = (p.smexit === "yes") ? ' data-href="'+p.clickthrough+'"' : "";
				thishtml += '<img'+smdata+self.noPin+' id="'+pfx+'-Img" class="sm-img" src="'+p.img+'">'+thisHotspotHTML;
				break;
		}
  	},
  	activePanel : 'prefs',
  	setPopWin : function( w ){_tsmSlackChromeExt.popWin = w;},
  	popWin : {}, //popup window obj
  	jQ : null,//popup window jQuery object
  	auth : false,//is current session authorized
  	has_mention : false,//does user have mention in convos
  	has_match : false,//does user have keyword filter match in convos
  	filters : "", //csv of filter strings
  	user : 'U033Z49JK', //user id //need to set dynamically
	authToken : "xoxp-3118431681-3135145631-4229637403-9444ae", //user id //need to set dynamically
  	messageCount : 0, // total message count //this.messages.length
	baseUrl : "https://slack.com/api/",
	convos : [ /* example data
	{"C0458GXEA": {'count':2, 'mention':true, 'match':false}, //id:count 
	{"D034YLRL1": {'count':1, 'mention':false, 'match':false}
	*/],
	messages : [ /* example data
		{"type":"message","channel":"C0458GXEA","user":"U033J331Q","text":"again","ts":"1428091509.001186","team":"T033GCPL1"}
		{"type":"message","channel":"D033Z49K7","user":"U033J331Q","text":"foo","ts":"1428091513.000004","team":"T033GCPL1"}
		{"type":"message","channel":"C0458GXEA","user":"U033J331Q","text":"<@U033Z49JK>: just in case!","ts":"1428092507.001192","team":"T033GCPL1"}
	*/],
	statuses : {
		badsession:{
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			suffix:'!:!'
		},
		usersfail:{
			panel:'prefs',
			message:'Fetch users failed',
			color:'#000',
			suffix:'!@!'
		},
		channelsfail:{
			panel:'prefs',
			message:'Fetch channel failed',
			color:'#000',
			suffix:'!#!'
		},
		unauthorized:{
			panel:'prefs',
			message:'Auth has failed',
			color:'#000',
			suffix:'!!!'
		},
		init:{
			panel:'prefs',
			message:'Initializing...',
			color:'#000',
			suffix:'...'
		},
		disconnected:{
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			suffix:'!!'
		},
		connected:{
			panel:'prefs',
			message:'Connected to Slack',
			color:'#5BF',
			suffix:''
		},
		message:{
			panel:'convo',
			message:'Unread message',
			color:'#F66',
			suffix:''
		},
		filter:{
			panel:'convo',
			message:'Unread filter match',
			color:'#F00',
			suffix:'#'
		},
		mention:{
			panel:'convo',
			message:'Unread mention',
			color:'#F00',
			suffix:'@'
		}
	},
	log : function ( msg ){
		console.log("log activePanel:"+this.activePanel+"\n\n"+msg );
	},
	//take array of objects and return same data with unique ID keys
	indexify : function( dataset, idField ) {
		var idField = ( typeof idField === 'undefined' ) ? 'id' : idField; //unset idField defaults to 'id' 
		var entry, results = {};
		for (entry in dataset) {
			results[ dataset[entry][idField] ] = dataset[entry];
		}
		return results;
	}
};

_tsmSlackChromeExt.init();



