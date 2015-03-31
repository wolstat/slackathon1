var _tsmSlackChromeExt = {
	init : function() { var self = this;
		self.updateStatus('init');
/*
		self.ajax( this.baseUrl+"rtm.start", function(rtmResult){

			self.rtmData = self.indexify(rtmResult);
			console.log('rtmData: '+JSON.stringify( self.rtmData ));

			self.ws = new window['WebSocket']( self.rtmData[ self.rtmData['0'] ] );
			self.ws.onopen = self.onopen;
			self.ws.onclose = self.onclose;
			self.ws.onmessage = self.onmessage;

			self.ajax( self.baseUrl+"users.list?token="+self.authToken, function(userResult){
				//self.userData = self.indexify(userResult.members);

				console.log("userData: "+JSON.stringify(self.userData));



			});

		});
	*/
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

				self.ws = new window.WebSocket( self.rtmData[ self.rtmData['0'] ] );
				self.ws.onopen = self.onopen;
				self.ws.onclose = self.onclose;
				self.ws.onmessage = self.onmessage;
				self.ws.send = self.send;

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
								//console.log('channelData: '+JSON.stringify(response3));
								console.log('channelData: success');
								_tsmSlackChromeExt.updateStatus('connected');
							}
						});
					}
				});
			}
		});
	},


 
// We need to stringify it through JSON before sending it to the server
/*ws.send();
*/

	onopen : function () { //wss
	    console.log("Connection with server open.");
	},
	onclose : function () { //wss
	    console.log("Connection with server closed; Maybe the server wasn't found, it shut down or you're behind a firewall/proxy.");
	},
	onmessage : function (evt) { //wss
	    var eObj = $.parseJSON(evt.data);
	    console.log("incoming message! --- "+evt.data);
	    if ( eObj.type === 'message' && eObj.user !== _tsmSlackChromeExt.userID ) { // // && eObj.reply_to === 'undefined'
	    	_tsmSlackChromeExt.messageCount++;
	    	_tsmSlackChromeExt.updateStatus('message');
	    	// add to messageQueue[]
	    }
	    //mark all as read from this channel {"type":"channel_marked","channel":"C0458GXEA","ts":"1427776180.000841"}
	},
	send : function (message, channel) { //wss
		return "{'as_user':true,'type':'message','channel','"+channel+"', 'text':'"+message+"'}";
	},
	updateStatus : function( state ){
		var ct = ( this.messageCount < 1 ) ? "" : (this.messageCount + "");

		chrome.browserAction.setBadgeText({ text: ct+this.statuses[state].suffix });
		chrome.browserAction.setBadgeBackgroundColor({ color:this.statuses[state].color }); //[155, 139, 187, 255]
  	},
  	user : 'U033Z49JK', //need to set dynamically
  	messageCount : 0, // init always has a "reply_to" message right away, hence -1
	authToken : "xoxp-3118431681-3135145631-4229637403-9444ae", //need to set dynamically
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
	ajax : function ( url, cb ) {
	    var xmlhttp = new XMLHttpRequest();
	    xmlhttp.onreadystatechange = function() {
	        if (xmlhttp.readyState == 4 ) {
	           if(xmlhttp.status == 200){
	               //console.log( "ajax "+url+": "+ );
	               cb(xmlhttp.responseText);
	           }
	           else if(xmlhttp.status == 400) {
	              console.log( 'There was an error 400')
	           }
	           else {
	               console.log( 'something else other than 200 was returned')
	           }
	        }
	    }
	    xmlhttp.open("GET", url, true);
	    xmlhttp.send();
	},
	//take array of objects and return same data with unique ID keys
	indexify : function( dataset, idField ) {
		//console.log("I am in phonecatFilters !!!!!!!!!"+allProj[0]._id);
		var idField = ( typeof idField === 'undefined' ) ? 'id' : idField; //no value defaults to 'id' 
		var entry, results = {};
		for (entry in dataset) {
			results[ dataset[entry][idField] ] = dataset[entry];
		}
		return results;
	}
};

_tsmSlackChromeExt.init();






