//TODO: delete rtm obj after all imports!
//TODO: display messages in a channel on reply panel
//TODO: clear convo from ext back to slack
//TODO: get messages to send through the wss
//TODO: scroll to bottom of chat message div:
///http://stackoverflow.com/questions/18614301/keep-overflow-div-scrolled-to-bottom-unless-user-scrolls-up
//TODO: handle new IM session
//TODO: handle new user
var _tsmSlackChromeExt = {
	authorize : function(){ var self = this;
		//var IdleState;
		self.updateStatus('preauth');			
		self.log("authorize called");
		self.manifest = chrome.runtime.getManifest();
		self.getPrefs( function(result) {
			var prefs = result.prefs;
			self.log('getPrefs success: result'+JSON.stringify(prefs));
			if ( typeof prefs !== 'undefined' && prefs.authToken && prefs.authToken !== null ) {
				self.startWss( prefs.authToken );
			}
		});
	},
	getToken : function(){ var self = this; //launchWebAuthFlow
		self.log("getToken called");
		//self.updateStatus('badtoken');
		var state = "blah"; //unique string		
	    var redirectUrl = chrome.identity.getRedirectURL();
	    //var authUrl = "https://slack.com/api/auth.test?" +
	    var authUrl = "https://slack.com/oauth/authorize?" +
	        "client_id=" + self.appId +
	        //"&redirect_uri=" + encodeURIComponent(redirectUrl) +
	        "&scope=identify,read,post,client" +
	        "&state=" + state;
	    chrome.identity.launchWebAuthFlow({url: authUrl, interactive: true},
	        function(responseUrl) {
				self.log("responseUrl:"+responseUrl); ///3118431681.4578378373.6378f6c3d9&state=blah
				var tempCode = responseUrl.substring(responseUrl.indexOf("=") + 1).replace('&state='+state,'');
				console.log("tempCode:"+tempCode);
				self.tokenRequest = $.ajax({
					url: self.apiUrl+"oauth.access",
					type: "get",
					data:  {
						client_id:self.appId,
						client_secret:'a89093c067275195b42b7a478d9f7edf',
						code:tempCode
						//redirect_uri:encodeURIComponent(redirectUrl)
					},
					dataType: "json",
					error: function( response ){
						self.log("tokenRequest error response"+JSON.stringify(response));
						self.updateStatus('unauthorized'); 
					}, //error handling, bad token, service unavailable, etc.
					success: function( response ){
						self.log("tokenRequest success response"+JSON.stringify(response));
						if ( response.access_token ) {
							self.saveAuth( response );
							self.startWss();
						}
					}
				});
	    });
	},
	startWss : function( token ){ var self = this;
		if ( typeof token == undefined ) self.authorize;
		self.updateStatus('init');
		self.unsetPopEnv();//init with null values
		self.wss = null;
		self.rtm = {};
		var token = token || self.prefs.authToken;
		self.log("startWss called token:"+token);
		self.rtmRequest = $.ajax({
			url: self.apiUrl+"rtm.start",
			type: "get",
			data:  {token:token},
			dataType: "json",
			error: function( response ){
				self.log("startWss error response"+response);
				self.updateStatus('unauthorized'); 
			}, //error handling, bad token, service unavailable, etc.
			success: function( response ){
				if ( response.ok === false ) {
					self.log('startWss ok:false response: '+JSON.stringify( response ));
					self.updateStatus('unauthorized');
					return;
				}
				self.newPanel('users');
				self.rtm = response;
				self.dee.self = self.rtm.self,
				self.dee.team = self.rtm.team,
				self.dee.usermeta = {},
				self.dee.convometa = {},
				//self.rtm.convos = [],
				self.dee.messages = [],
				self.rtm.state = {},///match/mention
				self.userdata = self.getObjectItem( self.rtm.users, self.rtm.self.id );
				self.importUsers(); //do users before convos
				self.importConvos();
				self.wss = new window.WebSocket( response.url ); //wss
				self.wss.onopen = self.wssOnOpen;
				self.wss.onclose = self.wssOnClose;
				self.wss.onerror = self.wssOnError;
				self.wss.onmessage = self.wssOnEvent;
				self.wss.send = self.wssSend;
				self.teamDomain = 'https://'+self.rtm.team.domain+'.slack.com/';
			}
		});
	},
	restartWss : function(){ var self = _tsmSlackChromeExt;
		var token = self.prefs.authToken;
		self.wssClose();
		self.startWss( token );
	},
	maybeRestartWss: function(){ var self = _tsmSlackChromeExt;
		if ( typeof self.wss.readyState === undefined || self.wss.readyState === 0 || self.wss.readyState === 3 ) {
			self.restartWss();
			self.log('Wss restarted - readyState '+self.wss.readyState);			
		} else {
			var data = new ArrayBuffer(10000000);
			self.wss.send(data);
			if (self.wss.bufferedAmount === 0) {
				self.log('maybeRestartWss decided not to restart self.wss.readyState = '+self.wss.readyState);
			} else {
				self.restartWss();
				self.log('Wss restarted - ArrayBuffer did not send self.wss.readyState = '+self.wss.readyState);			
			}
		}
	},
	onChromeStateChange : function( state ){ var self = _tsmSlackChromeExt;
		self.log('onChromeStateChange: '+state);
		self.active.chrome = ( state === 'active' );
	   if ( state === 'active' && typeof _tsmSlackChromeExt.wss !== 'undefined' && _tsmSlackChromeExt.wss !== null ) _tsmSlackChromeExt.maybeRestartWss();
	},
	wssOnOpen : function () { var self = _tsmSlackChromeExt;
		self.updateStatus('connected');
	    self.log("wssOnOpen");
	},
	wssOnClose : function () { var self = _tsmSlackChromeExt;
		self.updateStatus('disconnected');
		self.newPanel('prefs');
	    self.log("wssOnClose");
	    self.maybeRestartWss();
	},
	wssOnError : function () { var self = _tsmSlackChromeExt;
		//_tsmSlackChromeExt.updateStatus('disconnected');
		//_tsmSlackChromeExt.newPanel('prefs');
	    self.log("wssOnError");
		//_tsmSlackChromeExt.maybeRestartWss(); //wrap this in some logic to prevent infinite error loop
	},
	wssSend : function (data) { //wss
		//return "{'as_user':true,'type':'message','channel','"+channel+"', 'text':'"+message+"'}";
	},
	wssOnEvent : function (evt) { var self = _tsmSlackChromeExt;
	    var eObj = $.parseJSON(evt.data);
	    self.log("wssOnEvent evt.data "+evt.data);
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
	    	self.updateObject(self.rtm.users, eObj, 'user');
	    	//re-sortUsers();
	    } else if ( eObj.type === 'channel_joined' || eObj.type === 'im_created' || eObj.type === 'group_joined' ) {
	    	self.newConvo( eObj.channel );
	    }
	    //{"type":"channel_left","channel":"C04E134Q1"}
	},
	wssClose : function(){ var self = this;
		self.log('wssClose');
		this.wss.onclose = function () {}; // disable onclose handler first
    	self.wss.close();
		self.updateStatus('logout');			
	},
	updateStatus : function ( state ) { var self = this;
		self.has.auth = self.statuses[state].hasAuth;
		if (self.statuses[state].prefclass) self.newPrefsClass( self.statuses[state].prefclass );
		self.active.state = state;
		if (self.statuses[state].panel) self.newPanel( self.statuses[state].panel );
		self.updateAlertCounts();			
		var text = self.makeBadgeText( state );			
		self.updateBadge(text, self.statuses[state].color);			
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
	updateBadge : function( text, color ){
		chrome.browserAction.setBadgeText({ text:text });
		chrome.browserAction.setBadgeBackgroundColor({ color:color }); //[155, 139, 187, 255]
  	},
  	//take fresh rtm session data and save relevant user data
  	importUsers : function(){ var self = this;
  		var u, uObj = self.rtm.users;
  		for ( u in uObj ) { if ( uObj[u].deleted === false && uObj[u].is_bot === false ) {// has .channel and .id already
  			var uid = uObj[u].id;
  			//self.log( uObj[u].id + " : " +uObj[u].deleted + " : " +uObj[u].profile.email )
			self.dee.usermeta[uid] = {
				id : uid,
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
  		var co, cObjects = self.convoTypes;
  		for ( co in cObjects ) {
  			var l, list = self.rtm[ cObjects[co].n ];
			for ( l in list) {
				self.newConvo( list[l] );
				if (list[l].unread_count_display > 0 && list[l].latest.type === 'message' ) {
					//self.log('importConvos match '+JSON.stringify(list[l]));
					var msg = list[l].latest;
					msg['channel'] = list[l].id;
					self.markConvo(msg, false);	
				}
			}
		}
  	},
  	newConvo : function ( convo ){ var self = this;
  		var type = (convo.is_channel) ? 'channels' : 'groups', label = convo.name;
//  	self.dee.convometa[ self.dee.usermeta[uid].channel ].label = uObj[u].real_name;
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
	    self.updateStatus('message');
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
	markConvo: function( message, inc ){ var self = this; //update convo.channel obj
        self.log("markConvo");
		self.dee.messages.push(message);
		var activeConvo = self.dee.convometa[ message.channel ];
		if ( inc && message.user !== self.dee.self.id ) activeConvo.unread++;
  		var highlights = self.rtm.self.prefs.highlight_words.split(',');
  		for (word in highlights) { if ( message.text.indexOf( highlights[word].trim() ) !== -1 ) {
			activeConvo.match++; type = 'match';
  		}}
  		if ( message.text.indexOf( '<@'+self.dee.self.id+'>' ) !== -1 ) {
			activeConvo.mention++; type = 'mention';
  		}
	},
  	//check message for any filter matches or <@uid> mentions
  	urgencyCheck : function( message, convo ){ var self = this;
        self.log("urgencyCheck convo:"+convo);
  		var highlights = self.rtm.self.prefs.highlight_words.split(','), 
  		type = 'message', 
  		activeConvo = self.dee.convometa[ convo ];//match, im, mention
		if ( inc && message.user !== self.dee.self.id ) activeConvo.unread++;
  		for (word in highlights) { if ( message.text.indexOf( highlights[word].trim() ) !== -1 ) {
			activeConvo.match++; type = 'match';
  		}}
  		if ( message.text.indexOf( '<@'+self.dee.self.id+'>' ) !== -1 ) {
			activeConvo.mention++; type = 'mention';
  		}
		self.updateStatus(type);
		//self.makeUrgentState();
  	},
  	clickConvo : function ( convo ){ var self = _tsmSlackChromeExt;
  		//does convo have more unreads than messages in the queue? fetch history from slack?
  		this.log('clickConvo convo '+convo+ " - "+self.dee.convometa[ convo ].label);
		if (true) { //check local preference - reply in app or open slack?
			self.goSlackWebApp( self.teamDomain+"messages/"+self.dee.convometa[ convo ].label );
		} else {
			self.active.convo = convo;
			self.displayPanel('reply');			
		}
  	},
  	clickUser : function ( user ){ var self = _tsmSlackChromeExt;
		this.log('clickUser self.active.profile = '+JSON.stringify(self.dee.usermeta[ user ]));
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
  	/***************** HTML FUNCTIONS *****************************************/
  	newPrefsClass : function ( prefclass ) { var self = _tsmSlackChromeExt;
  		//self.log('newPrefsClass: '+prefclass);
  		var prefclass = prefclass || self.active.prefclass;
  		if ( this.popEnv() ) {
			var jQ = self.jQ;
			if ( typeof jQ === 'function' ) {
  				jQ('section#prefs').find('main').attr('class', prefclass);
  			}
  		}
  		self.active.prefclass = prefclass;
  	},
  	// set active panel while popup IS open
	displayPanel : function( clicked ){ var self = _tsmSlackChromeExt;
		self.active.lastpanel = self.active.panel;
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
  	goLastPanel : function(){ var self = _tsmSlackChromeExt; //to cancel out of a non-nav screen
  		self.displayPanel(self.active.lastpanel);
  	},
  	showQaLink : function() { var self = _tsmSlackChromeExt;
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
			var self = _tsmSlackChromeExt,
			jQ = self.jQ;
			jQ('section#convo').find('tr#'+id).remove;
		}
  	},
  	panelRefresh : function ( panel ){ //panelRefresh called when panel switches
  		if ( this.popEnv() ) {
			var self = _tsmSlackChromeExt,
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
					var tablehtml = "", co = self.dee.convometa;
					for ( var c in co ) { if (co[c].unread > 0){
						var pref = self.cPrefix[ co[c].id.substring(0,1) ];
						tablehtml += '<tr id="'+co[c].id+'">';
						tablehtml += '<td class="col1"><span class="badge">'+co[c].unread+'</span></td>';
						tablehtml += '<td class="col2"><a>'+pref+co[c].label+'</a></td>';
						tablehtml += '<td class="col3"><a>@'+co[c].mention+'</a></td>';
						tablehtml += '<td class="col4"><a>#'+co[c].match+'</a></td></tr>';
					}}
					jQ('section#reply').find('button.cancel').attr('data-lastpanel', 'convo');
					jQ('section#convo').find('main tbody').html( tablehtml );
					break;
				case "users":
					jQ('nav.nav span.'+panel).addClass('selected');
					jQ('section#users').find('main').html('');
					for ( var idx in self.dee.usermeta ){
						var data = self.dee.usermeta[idx];
						//self.log( "panel users loop "+data.id );
						//umcount = "";
						var umcount = ( data.channel &&
							C[ data.channel ] &&
							C[ data.channel ].unread > 0 ) ? C[ data.channel ].unread + "" : "";
						jQ('section#users').find('main').append('<span  class="'+ data.presence + ' team" id="'+data.id+'"><span class="badge">'+umcount+'</span><img data-id="'+data.id+'" title="'+data.real_name+'" data-id="'+data.id+'" src="'+data.profile.image_32+'""></span>');
					}
					jQ('section#reply').find('button.cancel').attr('data-lastpanel', 'users');
					break;
				case "reply":
					var ms = self.dee.messages, msghtml = "";
					for ( var m in ms ) { if (ms[m].channel === self.active.convo){
						msghtml += '<div id="msg_1425924683_000026"><i class="timestamp ">2:11 PM</i><a class="member" data-member-id="'+ms[m].user+'"> '+U[ms[m].user].real_name+'</a>:';
						msghtml += '<span class="message_content">'+ms[m].text+'</span></div>';
					}}
					jQ('section#reply').find('.history').html( msghtml );
					var cObj = self.dee.convometa[ self.active.convo ];
					jQ('section#reply').find('#viewprofile').toggle( ( cObj.parent_type === 'ims') );
					jQ('section#reply').find('#viewprofile').toggle( ( cObj.parent_type === 'ims') );
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
					self.newPrefsClass();
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
  	oncePerSession : function(jQ){ var self = _tsmSlackChromeExt;
		jQ('body').find('.appname').html( self.manifest.name );
		jQ('body').find('.appversion').html( self.manifest.version );
  	},
  	//////////// end UI HTML funcs /////////////////////
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
			_tsmSlackChromeExt.log('savePrefs success');
		});
  	},
  	clearPrefs : function (){
		this.log('clearPrefs called');
		chrome.storage.local.clear(function() {
			_tsmSlackChromeExt.wssClose();
			_tsmSlackChromeExt.log('clearPrefs success');
		});
  	},
  	goSlackWebApp : function ( url ) { var self = _tsmSlackChromeExt;
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
  	createTab : function ( url ){ var self = _tsmSlackChromeExt;
  		//self.log('createTab '+url); 
  		var props = {url:url};
  		chrome.tabs.create( props, function(tab){
  			_tsmSlackChromeExt.active.chromeTab = tab;
  		});
  	},
  	popEnv : function(){ return ( this.jQ !== null && this.popWin !== null ); },
  	unsetPopEnv : function(){ _tsmSlackChromeExt.popWin = null; _tsmSlackChromeExt.jQ = null; },
  	setPopEnv : function( w, jQ ){ var self = _tsmSlackChromeExt;
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
  	has : { //new state object
  		auth : false, //is current session authorized
  		connection : false,
  		match : false,
  		im : false,
  		mention : false,
  		message : false
  	},
  	active : { //display states
  		unreads : 0, //total unread msg count
  		matches : 0, //total match count
  		mentions : 0, //total @mention count
  		directs : 0, //total IMs
  		chromeTab : {},
  		lastpanel : '', //for peripheral panel cancel buttons, go back to the right place
  		profile : '', //user id, blank is just default
  		convo : 'C0458GXEA', //defailt to slack-project-1 //convo id, for reply page
  		chrome : true, //is chrome active?
  		state : 'preauth', //this is the h1 class on the prefs panel
  		panel : 'prefs', //unread, team, settings, (reply, groups, channels) //default panel in popup
  		prefclass : 'preauth' //show correct <article> on the prefs panel
  	},
  	dee : {}, //main obj for data storage
  	hasAuth : false, //is current session authorized
	apiUrl : "https://slack.com/api/", 
	appId : "3118431681.4197732086", //ID to access Slack API
  	prefs : { //save whole object directly to localStorage.prefs
		authToken : null,
	},
	statuses : {
		preauth:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Click Connect to give this app permission to access your Slack account',
			color:'#000',
			text:'.'
		},
		init:{
			prefclass : 'init',
			hasAuth : false,
			panel:'prefs',
			message:'Initializing...',
			color:'#000',
			text:'...'
		},
		badsession:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			text:'!:!'
		},
		logout:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Your session has timed out',
			color:'#000',
			text:'!'
		},
		badtoken:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Invalid token',
			color:'#000',
			text:'!!'
		},
		unauthorized:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Auth has failed',
			color:'#000',
			text:'!!!'
		},
		disconnected:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			text:'!!'
		},
		connected:{
			prefclass : 'active',
			hasAuth : true,
			//panel:'prefs',
			message:'Connected to Slack',
			color:'#C13', //3AF
			text:''
		},
		message:{
			prefclass : 'active',
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
  		return d.toLocaleDateString();
  		//d.toLocaleTimeString()
  	},
	updateObject : function(obj, payload, matchField){ //update obj where obj.matchField === payload.matchField
		var mKey = matchField || 'id'; //defaults to id
		var l, k;
		for (l in obj) { if ( obj[l][mKey] === payload[mKey] ) {
			for (k in payload) {
				obj[l][k] = payload[k];
			}
			this.log("updateObj new line:"+JSON.stringify( obj[l] ) );
			break;
		}}
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
_tsmSlackChromeExt.authorize();
chrome.idle.onStateChanged.addListener( function (state) { _tsmSlackChromeExt.onChromeStateChange(state); });
