//TODO: delete rtm obj after all imports - memory manageent
//TODO: markConvo update reply panel info also
//TODO: process messages replace <@UID> with @uname
//TODO: prefs screen slack links use goSlackWebApp()
//TODO: display messages in a channel on reply panel
//TODO: clear convo from ext back to slack
//TODO: get messages to send through the wss
//TODO: scroll to bottom of chat message div:
///http://stackoverflow.com/questions/18614301/keep-overflow-div-scrolled-to-bottom-unless-user-scrolls-up
//TODO: handle new user
var _tsmSlackHelper = {
	authorize : function(){ var self = this;
		//var IdleState;
		self.updateStatus('preauth');			
		self.log("authorize called");
		self.manifest = chrome.runtime.getManifest();
		self.getPrefs( function(result) {
			var prefs = result.prefs;
			self.log('authorize prefs: '+JSON.stringify(prefs));
			if ( typeof prefs !== 'undefined' && prefs.authToken && prefs.authToken !== null ) {
				self.prefs.authToken = prefs.authToken;
				self.newSession();
				self.startWss();
			}
		});
	},
	slackSecret : "221412fde9c004a1ddc7ddede9f0ceb7",
	chromeId : "dcjhmokcdfafldjdiddhckfnkfkbklkm", //chrome.runtime.id //chrome web store ID
	slackId : "3118431681.4197732086", //ID to access Slack API
	extId : chrome.runtime.id,
	// https://api.slack.com/docs/oauth
	// https://developer.chrome.com/apps/identity#method-launchWebAuthFlow
	// https://api.slack.com/methods/oauth.access
	getToken : function(){ var self = this; //launchWebAuthFlow
		self.log("getToken called");
		//getAuthToken
		//new Error('getToken called');
		var chromeId = self.chromeId;
		var state = self.extId;
		var uri = encodeURI("https://nbmelpjiocjfgbkomjebhcodoklhhgmj.chromiumapp.org/");
	    var authUrl = "https://slack.com/oauth/authorize?" +
	        "client_id=" + self.slackId +
	    	//"&redirect_uri=" + uri +
	        "&scope=identify,read,post,client";//&state="+state;
	    chrome.identity.launchWebAuthFlow({'url': authUrl, 'interactive': true}, function(responseUrl) {
			self.log("getToken authUrl:"+authUrl+"\n\nresponseUrl:"+responseUrl);
			if (responseUrl) {
				var tempCode = self.getQueryVariable(responseUrl, 'code');
				var data = {
					client_id:self.slackId,
					client_secret:self.slackSecret,
					//redirect_uri:uri,
					code:tempCode
				};
				//self.log("getToken data:"+JSON.stringify(data));
				self.slackApi("oauth.access", data, function(response){
					//self.log('getToken slackApi response: '+JSON.stringify( response ));
					if ( response.ok === false ) {
						self.updateStatus('unauthorized');
						new Error('unauthorized');
						return;
					} else if ( response.access_token ) {
						self.saveAuth( response );
						self.startWss();
					}
				});
			}
	    });
	},
	startWss : function(){ var self = this;
		self.log("startWss called");
		self.slackApi("rtm.start", {}, function(response){
			if ( response.ok === false ) {
				self.log('startWss ok:false response: '+JSON.stringify( response ));
				self.updateStatus('unauthorized');
				return;
			}
			//self.log("startWss response:"+JSON.stringify(response.users));
			self.newPanel('users');
			self.rtm = response;//this is the big init chunk of rtm session data
			self.dee.self = self.rtm.self,
			self.dee.team = self.rtm.team,
			self.dee.usermeta = {},
			self.dee.convometa = {},
			self.dee.messages = [],
			self.userdata = self.getObjectItem( self.rtm.users, self.rtm.self.id );
			self.importUsers(); //do users before convos
			self.importConvos();
			self.wss = new window.WebSocket( response.url ); //wss
			self.wss.onopen = self.wssOnOpen;
			self.wss.onclose = self.wssOnClose;
			self.wss.onerror = self.wssOnError;
			self.wss.onmessage = self.wssOnEvent;
			self.teamDomain = 'https://'+self.rtm.team.domain+'.slack.com/';
		});
	},
///////////// SESSION STUFF
	wssOnOpen : function () { var self = _tsmSlackHelper;
	    self.log("wssOnOpen");
		self.updateStatus('connected');
		self.has.connection = true;
		setTimeout(function(){ self.updateStatus('message'); }, 2000); //clear connected badge display
	},
	wssOnClose : function () { var self = _tsmSlackHelper;
	    self.log("wssOnClose");
    	self.newSession();//reset vars
		self.updateStatus('disconnected');
		self.newPanel('prefs');
		self.has.connection = false;
	    //self.checkWss();
	},
	wssOnError : function () { var self = _tsmSlackHelper;
		//self.updateStatus('disconnected');
		//self.newPanel('prefs');
	    self.log("wssOnError");
		//self.checkWss(); //wrap this in some logic to prevent infinite error loop
	},
	wssOnEvent : function (evt) { var self = _tsmSlackHelper;
	    var eObj = $.parseJSON(evt.data);
	    self.log("wssOnEvent "+evt.data);
	    if ( eObj.type === 'message' && typeof eObj.reply_to === 'undefined' ) {
	    	if ( eObj.subtype === 'message_changed' ) eObj = eObj.message;
	    	self.markConvo( eObj, true );
			self.updateStatus('message');
			//self.newPanel('convo');
			self.panelRefresh();
	    } else if ( eObj.type === 'channel_marked' || eObj.type === 'group_marked' || eObj.type === 'im_marked' ) { //direct_message marked?
	    	self.unmarkConvo( eObj );
			self.panelRefresh('convo');
			self.updateStatus('message');
	    } else if ( eObj.type === 'presence_change' ) {
	    	self.updateObject(self.dee.usermeta, eObj, 'user');
	    	self.panelRefresh('users');
	    	//re-sortUsers();
	    } else if ( eObj.type === 'channel_joined' || eObj.type === 'im_created' || eObj.type === 'group_joined' ) {
	    	self.newConvo( eObj.channel );
	    } else if (eObj.type === 'pong') {
	    	self.active.pong  = eObj.ts;
	    }
	    //{"type":"channel_left","channel":"C04E134Q1"}
	},
	wssClose : function(){ var self = this;
		self.log('wssClose');
		self.updateStatus('logout');			
    	self.newSession();
	},
	wssSend : function(obj){ var self = _tsmSlackHelper;
		self.log('wssSend '+JSON.stringify(obj) );
		try {
		    self.wss.send( JSON.stringify(obj) );
		} catch( err ) {
			self.log("wssSend err "+JSON.stringify(err));
			//if () certain kind of errors - avoid trying to restart if unnecessary
			self.restartWss();
			return false;
		}
		return true;
	},
	newSession : function(){ var self = this;
		if (self.wss ) {
			self.wss.onclose = function () {}; // disable onclose handler first
	    	self.wss.close();
			self.has.connection = false;
	    	delete self.wss;//sockets session
	    }
    	delete self.rtm;//session data
    	delete self.dee;//operating metadata
		self.unsetPopEnv();//init with null values
		self.wss = null;
		self.rtm = {};
		self.dee = {};//users, convos
		self.updateStatus('init');
	},
	onChromeStateChange : function( state ){ var self = _tsmSlackHelper;
		self.log('onChromeStateChange: '+state);
		self.active.chrome = state; // && typeof _tsmSlackHelper.wss !== 'undefined' && _tsmSlackHelper.wss !== null
		if ( state === 'active' ) self.checkWss();
	},
	restartWss : function(){ var self = _tsmSlackHelper;
		self.log('restartWss called');
		self.wssClose();
		self.startWss();
	},
	checkWss: function(){ var self = _tsmSlackHelper; //self.wss.readyState will still equal 1 for a dead connection
		self.log('checkWss called');
		if (self.has.connection === true) {
			var pingts = Date.now(), pingdata = {type: "ping", id: self.active.ping, ts:pingts},
				loopct = 0; self.active.ping++; //ping ids need to be unique
			if ( !( self.wssSend(pingdata) ) ) return;
			self.waitForPong = setInterval( function(){//wait for pong in case of timeout
				if ( loopct > 12 ) {
					self.restartWss();
					clearInterval( self.waitForPong );
				} else if (self.active.pong === pingts) { //pong callback happened with same ts
					clearInterval( self.waitForPong );
				}
				loopct++;
			}, 400);
		}
	},
	getPresence : function(user){ var self = this;
		self.log("getPresence");
		var data = { user: user };
		self.slackApi("users.getPresence", data, function(response){
			self.log("getPresence response:"+JSON.stringify(response))
			if ( response.ok ) {
				data.presence = response.presence;
	    		self.updateObject( self.dee.usermeta, data, 'user' );
	    	}
		});
	},
	//restoring a stale session, user statuses get way out of sync
  	getUsers : function(){ var self = this;
		self.slackApi("users.list", {}, function(response){
			self.log("getUsers response:"+JSON.stringify(response))
		});
  	},
  	postMessage : function(msg){ var self = _tsmSlackHelper;
  		var data = {"as_user":true,"type":"message","channel":self.active.convo,"text":msg};
		self.log("postMessage: "+data);
		self.slackApi("chat.postMessage", data, function(response){
			self.log("postMessage response:"+JSON.stringify(response))
		});
  	},
	apiUrl : "https://slack.com/api/",
  	slackApi: function(method, data, cb){ var self = this;
  		if (self.prefs.authToken) data.token = self.prefs.authToken;
  		var url = self.apiUrl+method;
  		self.log('slackApi call to self.prefs.authToken '+self.prefs.authToken+" \n\n"+url+' \n\ndata:'+JSON.stringify(data));
		var request = $.ajax({
				url: url,
				type: "get",
				data:  data,
				dataType: "json"
			}).done( function(response){
				cb(response);
			});
  	},
///////////SLACK CLIENT
	updateStatus : function ( state ) { var self = this;
		self.log('updateStatus state:'+state);
		self.has.auth = self.statuses[state].hasAuth;
		if (self.statuses[state].stateclass) self.newBodyClass( self.statuses[state].stateclass );
		self.active.state = state;
		if (self.statuses[state].panel) self.newPanel( self.statuses[state].panel );
		self.updateAlertCounts();			
		var text = self.makeBadgeText( state );			
		self.updateBadge(text, self.statuses[state].color);			
	},
	updateBadge : function( text, color ){
		chrome.browserAction.setBadgeText({ text:text });
		chrome.browserAction.setBadgeBackgroundColor({ color:color }); //[155, 139, 187, 255]
  	},
  	makeBadgeText : function( state ) { var self = this;
		if ( self.statuses[state].text !== '' ) return self.statuses[state].text;
		var ct =  ( self.active.unreads < 1 ) ? "" : ( self.active.unreads + "" );
		var suffix = ( self.active.mentions > 0 || self.active.directs > 0 ) ? '@' :
			( self.active.matches > 0 ) ? '#' : '';
		return ct+suffix;//only one suffix character, @/direct is higher priority than #/match
  	},
  	updateAlertCounts : function () { var self = this;
  		var um = 0, hm = 0, am = 0, dm = 0; //unread, highlight, @messages
  		if ( self.dee && self.dee.convometa ) { for (i in self.dee.convometa) {
			if ( self.dee.convometa[i].unread > 0 ) {
				um = ( um + ( self.dee.convometa[i].unread - 0 ) );
				if ( self.dee.convometa[i].parent_type === 'ims' ) {
					dm = ( dm + ( self.dee.convometa[i].unread - 0 ) );
				}
			}
			if ( self.dee.convometa[i].match > 0 ) {
				hm = ( hm + ( self.dee.convometa[i].match - 0 ) );
			}
			if ( self.dee.convometa[i].mention > 0 ) {
				am = ( am + ( self.dee.convometa[i].mention - 0 ) );
			}
  		}}
		self.active.unreads = um;  			
		self.active.matches = hm;  			
		self.active.mentions = am;  			
		self.active.directs = dm;  			
  	},
  	//take fresh rtm session data and save relevant user data
  	importUsers : function(){ var self = this;
  		var u, uObj = self.rtm.users;
  		for ( u in uObj ) { if ( uObj[u].deleted === false && uObj[u].is_bot === false ) {// has .channel and .id already
  			var uid = uObj[u].id;
  			//self.log( uObj[u].id + " : " +uObj[u].deleted + " : " +uObj[u].profile.email )
			self.dee.usermeta[uid] = {
				id : uid,
				user : uid,
				channel : "",
  				real_name : uObj[u].real_name || uObj[u].name,
  				name : uObj[u].name,
  				presence : uObj[u].presence,
  				profile : uObj[u].profile
  			};
		}}
  	},
  	//take fresh rtm session data and pull out convo meta and unread messages
  	importConvos : function(){ var self = this;
  		var co, cObjects = self.convoTypes, newm = false;
  		for ( co in cObjects ) {
  			var l, list = self.rtm[ cObjects[co].n ];
			for ( l in list) {
				self.newConvo( list[l] );
				if (list[l].unread_count_display > 0 && list[l].latest.type === 'message' ) {
					//self.log('importConvos match '+JSON.stringify(list[l]));
					var msg = list[l].latest;
					msg['channel'] = list[l].id;
					self.markConvo(msg, false);	
					newm = true;
				}
			}
		}
		if (newm) self.updateStatus('message');
  	},
  	newConvo : function ( convo ){ var self = this;
  		var type = (convo.is_channel) ? 'channels' : 'groups', label = convo.name;
		if (convo.is_im) { 
			if (self.dee.usermeta[ convo.user ]) {
				label = self.dee.usermeta[ convo.user ].real_name;// pull user's name as convo label
				self.dee.usermeta[ convo.user ].channel = convo.id;//reference convo id in usermeta				
			}
			type = 'ims';
		}
		self.dee.convometa[convo.id] = { 
			"id":convo.id,
			"parent_type":type, //they're plural in the rtm response
			"label":label,
			"unread":(convo.unread_count_display - 0) || 0,
			"mention":0,
			"match":0
		};
  	},
  	/// new message
	markConvo: function( message, inc ){ var self = this; //update convo.channel obj
        if ( typeof message.text === undefined ) message.text = '';
        if ( message.subtype === "bot_message" ) {
        	message.text = message.attachments.text;
        	self.log("markConvo message.subtype "+ message.subtype);
        }//group_leave
		var activeConvo = self.dee.convometa[ message.channel ];
        if (message.text && typeof activeConvo === 'object') { //pesky bot messages
			self.dee.messages.push(message); //self.fixMessage( message );
			if ( inc && message.user !== self.dee.self.id ) activeConvo.unread++;
	  		var highlights = self.rtm.self.prefs.highlight_words.split(',');
	  		for (word in highlights) { if ( message.text.indexOf( highlights[word].trim() ) !== -1 ) {
				activeConvo.match++; type = 'match';
	  		}}
	  		if ( message.text.indexOf( '<@'+self.dee.self.id+'>' ) !== -1 ) {
				activeConvo.mention++; type = 'mention';
	  		} else { self.log("markConvo failed for "+JSON.stringify(message));}
  		}
	},
	//replace meta text with display tags
	fixMessage : function ( message ){ var self = this;
		var U = self.dee.usermeta[ message.user ];
		var mention = "<@([0-9A-Z])+>";
		var re = new RegExp(mention, 'g');

		message.text = message.text.replace(re, '<span data-uid="'+$1+'">@'+U.name+'</span>');
		console.log(message.text);
		//self.dee.messages.push(message);
	},
  	// pull all messages from a read channel out of queue
	unmarkConvo : function( obj ){ var self = this;
		var mQ = self.dee.messages, newQ = [],
		i, channel = obj.channel;
		for (i = 0;i<mQ.length;i++) { //remove all messages from queue
			//self.log("unmark loop i:"+i+" :: "+JSON.stringify(mQ));
			if ( mQ[i].channel !== channel ) {
				newQ.push(mQ[i]);
			}
		}
		self.dee.messages = newQ;
  		self.dee.convometa[ channel ].unread = 0;
  		self.dee.convometa[ channel ].match = 0;
  		self.dee.convometa[ channel ].mention = 0;
  	},
///// EXT UI
  	clickConvo : function ( convo ){ var self = _tsmSlackHelper;
  		//does convo have more unreads than messages in the queue? fetch history from slack?
  		this.log('clickConvo convo '+convo+ " - "+self.dee.convometa[ convo ].label);
		if (false) { //check local preference - reply in app or open slack?
			self.goSlackWebApp( self.teamDomain+"messages/"+self.dee.convometa[ convo ].label );
		} else {
			self.active.convo = convo;
			self.displayPanel('reply');			
		}
  	},
  	clickUser : function ( user ){ var self = _tsmSlackHelper;
		this.log('clickUser '+user);
		//this.log('clickUser self.active.profile = '+JSON.stringify(self.dee.usermeta[ user ]));
  		//self.getPresence(user);//update presence
  		var panel = 'reply', u = self.dee.usermeta[ user ], C = self.dee.convometa;
		//this.log('clickUser u.channel '+u.channel+ " - "+C[ u.channel ]);
		//xthis.log('clickConvo all convos '+JSON.stringify(this.rtm.convos));
		/*if (  typeof u.channel !== undefined && 
			typeof C[ u.channel ] !== undefined &&
			C[ u.channel ].unread > 0 ) { //otherwise panel = 'profile'
			self.active.convo = self.dee.convometa[ u.channel ].id;
		} else { */
			panel = 'profile';
			self.active.profile = user;
		//}
		self.displayPanel( panel );
  	},
  	//set active panel while popup is not open
  	newPanel : function( panel ) { var self = this;
  		//self.log('newPanel: '+panel);
  		self.active.panel = panel;
  	},
/////////// HTML FUNCTIONS
  	newBodyClass : function ( stateclass ) { var self = _tsmSlackHelper;
  		//self.log('newBodycLass: '+stateclass);
  		var stateclass = stateclass || self.active.stateclass;
  		if ( this.popEnv() ) {
			var jQ = self.jQ;
			if ( typeof jQ === 'function' ) {
  				jQ('body').attr('class', stateclass);
  			}
  		}
  		self.active.stateclass = stateclass;
  	},
  	// set active panel while popup IS open
	displayPanel : function( clicked ){ var self = _tsmSlackHelper;
		self.newPanel( clicked );
		//this.log("displayPanel "+clicked);
		if ( this.popEnv() ) {
			var jQ = self.jQ,
				entry, result = [];
			jQ("#sections > section").each(function( ind, el ){
				if ( el.id === clicked ) {
					jQ( el ).show();
					self.panelRefresh(clicked);
				} else {
					jQ( el ).hide();
				}
			});
		}
  	},
  	showQaLink : function() { var self = _tsmSlackHelper;
		self.jQ('section#prefs').find('#qalink').show();
  	},
  	panelUpdate : function( panel ){ //panelUpdate called to update data values when the user may be looking at the page 
  		return 'f';
  	},
  	bgUpdate : function() {
  		//wrapper function to check if popup exists and then grab the jQ object
  		//to call things like newPrefsState(jQ), 
  	},
  	removeConvoRow : function (id){ //needed? should we just do a panelRefresh?
  		if ( this.popEnv() ) {
			var self = _tsmSlackHelper,
			jQ = self.jQ;
			jQ('section#convo').find('tr#'+id).remove;
		}
  	},
  	panelRefresh : function ( panel ){ //panelRefresh called when panel switches
  		if ( this.popEnv() ) {
			var self = _tsmSlackHelper,
			panel = panel || self.active.panel, 
			jQ = self.jQ,
			w = self.popWin,
			U = self.dee.usermeta,
			C = self.dee.convometa;
	    	jQ('nav.nav span').removeClass('selected');
			switch( panel ) {
				case "convo":
					var msgCt = self.active.unreads; //self.getMessageCount();
					jQ('nav.nav span.'+panel).addClass('selected');
					jQ('section#convo').find('header h2').attr('class', 'ct'+msgCt );
					jQ('section#convo').find('header h2 .badge').html( msgCt );
					var readhtml = "", unreadhtml = "", co = self.dee.convometa;
					for ( var c in co ) {
						var pref = self.cPrefix[ co[c].id.substring(0,1) ];
						if (co[c].unread > 0){
							readhtml += '<tr id="'+co[c].id+'">';
							readhtml += '<td class="col1"><span class="badge">'+co[c].unread+'</span></td>';
							readhtml += '<td class="col2"><a>'+pref+co[c].label+'</a></td>';
							readhtml += '<td class="col3"><a>@'+co[c].mention+'</a></td>';
							readhtml += '<td class="col4"><a>#'+co[c].match+'</a></td></tr>';
						} else if ( co[c].parent_type !== 'ims' ) {
							unreadhtml += '<tr id="'+co[c].id+'"><td colspan="4" class="col1"><a>'+pref+co[c].label+'</a></td></tr>';
						}
					}
					jQ('section#convo').find('main tbody').html( readhtml ); // + unreadhtml
					break;
				case "channels":
					var msgCt = self.active.unreads; //self.getMessageCount();
					jQ('nav.nav span.'+panel).addClass('selected');
					jQ('section#convo').find('header h2').attr('class', 'ct'+msgCt );
					jQ('section#convo').find('header h2 .badge').html( msgCt );
					var readhtml = "", unreadhtml = "", co = self.dee.convometa;
					for ( var c in co ) {
						var pref = self.cPrefix[ co[c].id.substring(0,1) ];
						if ( co[c].parent_type !== 'ims' ) {
							unreadhtml += '<tr id="'+co[c].id+'"><td colspan="4" class="col1"><a>'+pref+co[c].label+'</a></td></tr>';
						}
					}
					jQ('section#convo').find('main tbody').html( unreadhtml );
					break;
				case "users":
					jQ('nav.nav span.'+panel).addClass('selected');
					jQ('section#users').find('main .scroller').html('');
					for ( var idx in self.dee.usermeta ){
						var data = self.dee.usermeta[idx],
							umcount = '',
							convoid = '';
						//self.log( "panel users loop "+data.id );
						//umcount = "";
						if  ( data.channel && C[ data.channel ] && C[ data.channel ].unread > 0 ) {
							umcount = C[ data.channel ].unread;
							convoid = data.channel;
						}
						jQ('section#users').find('main .scroller').append('<span data-convo-id="'+convoid+'" class="'+ data.presence + ' team" id="'+data.id+'"><span class="badge">'+umcount+'</span><img data-id="'+data.id+'" title="'+data.real_name+'" data-id="'+data.id+'" src="'+data.profile.image_32+'""></span>');
					}
					break;
				case "reply":
					var ms = self.dee.messages, msghtml = "";
					for ( var m in ms ) { if (ms[m].channel === self.active.convo){
						self.log("panelRefresh convo message:"+JSON.stringify(ms[m]));
						msghtml += '<div id="msg_1425924683_000026"><i class="timestamp ">'+self.makeTime(ms[m].ts)+'</i><a class="member" data-member-id="'+ms[m].user+'"> '+U[ms[m].user].real_name+'</a>:';
						msghtml += '<span class="message_content">'+ms[m].text+'</span></div>';
					}}
					jQ('section#reply').find('.history').html( msghtml );
					var cObj = self.dee.convometa[ self.active.convo ];
					jQ('section#reply').find('#viewprofile').toggle( ( cObj.parent_type === 'ims') );
					jQ('section#reply').find('#viewprofile').toggle( ( cObj.parent_type === 'ims') );
					jQ('section#reply').find('header h2').attr('class', 'ct'+cObj.unread );
					jQ('section#reply').find('h2').html( '<span class="badge">'+cObj.unread+'</span>'+cObj.label );
					break;
				case "profile":
					var uObj = self.dee.usermeta[ self.active.profile ];
					jQ('section#profile').find('img#profile192').attr('src', uObj.profile.image_192);
					jQ('section#profile').find('h2').html( uObj.real_name+' <span class="badge '+uObj.presence+'">'+uObj.presence+'</span>' );
					//jQ('section#profile').find('main .title').html( uObj.profile.title );
					jQ('section#profile').find('main .slacklink').attr( 'href', self.teamDomain+"messages/@"+uObj.name+"/" ).html( uObj.name );
					jQ('section#profile').find('main .skypelink').attr( 'href', 'skype:'+uObj.profile.skype+"?userinfo" ).html( uObj.profile.skype );
					jQ('section#profile').find('main .mailto').attr( 'href', 'mailto:'+uObj.profile.email ).html( uObj.profile.email );
  					//self.active.profile = '';//clear out value
					break;
				case "prefs":
					self.newBodyClass();
					jQ('nav.nav span.'+panel).addClass('selected');//what is this?
					if ( self.has.auth ) {
						jQ('section#prefs').find('.uname').html(self.rtm.self.name);
						jQ('section#prefs .detail').find('img.pic').attr('src', self.userdata.profile.image_192);
						jQ('section#prefs .detail').find('.team')
							.attr( 'href', self.teamDomain )
							.html(self.rtm.team.name);
						jQ('section#prefs .detail').find('.highlight_words')
							.attr( 'href', self.teamDomain+"account/notifications#highlight_words_div" )
							.html(self.rtm.self.prefs.highlight_words);
					}
					//jQ('section#prefs').find('.user').html('');
					//jQ('section#prefs').find('.user').append('<img class="pic" src="'++'"><div><p>Team: <span class="team">'++'</span></p><p>You: <span class="uname">'++'</span></p><p>Highlight words: <span class="filterterms">'+self.rtm.self.prefs.highlight_words+'</span></p></div>');
					break;
			}
		}
  	},
  	oncePerSession : function(jQ){ var self = _tsmSlackHelper;
		jQ('body').find('.appname').html( self.manifest.name );
		jQ('body').find('.appversion').html( self.manifest.version );
  	},
//////////// LOCAL DATA MGMT
  	saveAuth : function( payload ){
		this.log('saveAuth called '+JSON.stringify(payload));
		this.prefs.authToken = payload.access_token;//this.prefs.userId = payload.userId;
		this.savePrefs();
  	},
  	getPrefs : function( cb ){var self = this;
		this.log('getPrefs called');
		chrome.storage.local.get('prefs', function(result){ cb(result); } );
  	},
  	savePrefs : function(){
		this.log('savePrefs called');
		chrome.storage.local.set({'prefs': this.prefs}, function() {
			_tsmSlackHelper.log('savePrefs success');
		});
  	},
  	clearPrefs : function (){
		this.log('clearPrefs called');
		this.prefs.authToken = '';
		chrome.storage.local.clear(function() {
			_tsmSlackHelper.wssClose();
			_tsmSlackHelper.log('clearPrefs success');
		});
  	},
  	///open links in Chrome tab
  	goSlackWebApp : function ( url ) { var self = _tsmSlackHelper;
  		//find a tab with baseurl https://tsmproducts.slack.com/ and re-use?
  		var props = {url:url}, tid = self.active.chromeTab.id;
  		this.log('goSlackWebApp url '+url+" id:"+self.active.chromeTab.id+"  ");
  		if (tid) {
	  		chrome.tabs.get(tid, function(tab){
	  			self.log( 'chrome.tabs.get '+JSON.stringify(tab) );
	  			if (tab && tab.id) {
	  				chrome.tabs.update(self.active.chromeTab.id, props);
	  			} else {
	  				self.createTab(url);
	  			}
	  		});
  		} else { self.createTab(url); }
  	},
  	createTab : function ( url ){ var self = _tsmSlackHelper;
  		//self.log('createTab '+url); 
  		var props = {url:url};
  		chrome.tabs.create( props, function(tab){
  			_tsmSlackHelper.active.chromeTab = tab;
  		});
  	},
  	//communicate with extension window popup environment
  	popEnv : function(){ return ( this.jQ !== null && this.popWin !== null ); },
  	unsetPopEnv : function(){ _tsmSlackHelper.popWin = null; _tsmSlackHelper.jQ = null; },
  	setPopEnv : function( w, jQ ){ var self = _tsmSlackHelper;
  		self.popWin = w; self.jQ = jQ;
  		self.oncePerSession(jQ);
  		self.displayPanel( self.active.panel );
  	},
  	convoTypes : [
  		{n: 'channels', i: 'C', s: '#'}, 
  		{n: 'groups', i: 'G', s: '&gt'}, 
  		{n: 'ims', i: 'D', s: '@'}
  	],
  	cPrefix : {'C':'#', 'G':'&gt;', 'D':'@'}, //convo id initials
  	//hasAuth : false, //is current session authorized
  	has : { //new state object
  		auth : false, //is current session authorized
  		connection : false,
  		match : false,
  		im : false,
  		mention : false,
  		message : false
  	},
  	active : { //display states
  		ping : 23452, //incremented - needs to be a unique value
  		pong : 0,// timestamp- compared with ts sent with the ping
  		unreads : 0, //total unread msg count
  		matches : 0, //total match count
  		mentions : 0, //total @mention count
  		directs : 0, //total IMs
  		chromeTab : {},//chrome.tabs.get tab object
  		profile : '', //user id, blank is just default
  		convo : 'C0458GXEA', //defailt to slack-project-1 //convo id, for reply page
  		chrome : true, //is chrome active?
  		state : 'preauth', //this is the h1 class on the prefs panel
  		panel : 'prefs', //unread, team, settings, (reply, groups, channels) //default panel in popup
  		stateclass : 'preauth' //show correct content with CSS using body.stateclass
  	},
  	dee : {}, //main obj for data storage
  	prefs : { //save whole object directly to localStorage.prefs
		authToken : null,
	},
	statuses : {
		preauth:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Click Connect to give this app permission to access your Slack account',
			color:'#000',
			text:'.'
		},
		init:{
			stateclass : 'init',
			hasAuth : false,
			panel:'prefs',
			message:'Initializing...',
			color:'#000',
			text:'...'
		},
		badsession:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			text:'!:!'
		},
		logout:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Your session has timed out',
			color:'#000',
			text:'!'
		},
		badtoken:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Invalid token',
			color:'#000',
			text:'!#!'
		},
		unauthorized:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Auth has failed',
			color:'#000',
			text:'!!!'
		},
		disconnected:{
			stateclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			text:'!!'
		},
		connected:{
			stateclass : 'active',
			hasAuth : true,
			//panel:'prefs',
			message:'Connected to Slack',
			color:'#3A3', //3AF
			text:'+'
		},
		message:{
			stateclass : 'active',
			hasAuth : true,
			panel:'convo',
			message:'Unread message',
			color:'#C13',
			text:''
		}
	},
	log : function ( msg ){
		//console.log("log activePanel:"+this.activePanel+"\n\n"+msg );
		console.log( msg );
	},
  	makeTime : function( ts ){
  		var d = new Date(parseFloat(ts) * 1000);
  		return d.toLocaleTimeString();
  		//d.toLocaleTimeString()
  	},
  	//self.updateObject(self.dee.usermeta, eObj, 'user');
	updateObject : function(obj, payload, matchField){ //update obj where obj.matchField === payload.matchField
		var mKey = matchField || 'id'; //defaults to id
		var l, k;
		for (l in obj) { if ( obj[l][mKey] === payload[mKey] ) {
			for (k in payload) {
				obj[l][k] = payload[k];
			}
			//this.log("updateObject "+matchField+"="+obj[l][mKey]+" - "+JSON.stringify( obj[l] ) );
			break;
		}}
	},
	getQueryVariable : function (url, variable) {
	  var query = url.split("?")[1];
	  var vars = query.split("&");
	  for (var i=0;i<vars.length;i++) {
	    var pair = vars[i].split("=");
	    if (pair[0] == variable) {
	      return pair[1];
	    }
	  }
	  return null;
	},
	getObjectItem : function(obj, value, matchField){ //return property where obj.matchField === value
		var mKey = matchField || 'id'; //defaults to id
		var l;
		for (l in obj) { if ( obj[l][mKey] === value ) {
			return obj[l];
			this.log("getObjectItem found:"+JSON.stringify( obj[l] ) );
			break;
		}}
		return false;
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
_tsmSlackHelper.authorize();
chrome.idle.onStateChanged.addListener( function (state) { _tsmSlackHelper.onChromeStateChange(state); });
