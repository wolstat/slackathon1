//TODO: initial auth workflow
//  https://developer.chrome.com/apps/app_identity
//launchWebAuthFlow

//TODO: gotcha - leaving slack app while on a channel assumes you see all messages in that channel

//TODO: display messages in a channel on reply panel
//TODO: make directIM numbers live on users panel
//TODO: loop through and make full usermeta data
//TODO: delete rtm obj after all imports!

//TODO: logic to detect a stale session and restart

//TODO: handle new user
//TODO: handle new channel

//TODO: reply in-app
//TODO: clear convo from ext back to slack
//TODO: get messages to send through the wss

var _tsmSlackChromeExt = {
	authorize : function(){ var self = this;
		//var IdleState;
		self.updateStatus('preauth');			
		self.log("authorize called");
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
		//launchWebAuthFlow 
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
				self.log("startWss error "+response);
				self.updateStatus('unauthorized'); 
			}, //error handling, bad token, service unavailable, etc.
			success: function( response ){
				console.log('startWss response: '+JSON.stringify( response ));
				if ( response.ok === false ) {
					self.updateStatus('unauthorized');
					return;
				}
				self.active.panel = 'users';
				self.rtm = response;
				self.rtm.usermeta = {},
				self.rtm.convometa = {},
				self.rtm.convos = [],
				self.rtm.messages = [],
				self.rtm.state = {},///match/mention
				//add users info to self profile
				self.userdata = self.getObjectItem( self.rtm.users, self.rtm.self.id );
				//C033GCPLPconsole.log("self.userdata"+JSON.stringify(self.userdata));
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
	onChromeStateChange : function( state ){ var self = _tsmSlackChromeExt;
		self.log('onChromeStateChange: '+state);
		self.active.chrome = ( state === 'active' );
	   if ( state === 'active' && typeof _tsmSlackChromeExt.wss !== 'undefined' && _tsmSlackChromeExt.wss !== null ) _tsmSlackChromeExt.maybeRestartWss();
	},
	maybeRestartWss: function(){ var self = _tsmSlackChromeExt;
		if ( self.wss.readyState === 0 || self.wss.readyState === 3 ) {
			self.startWss();
			self.log('maybeRestartWss restarted - readyState match');			
		} else {
			var data = new ArrayBuffer(10000000);
			self.wss.send(data);
			if (self.wss.bufferedAmount === 0) {
				self.log('maybeRestartWss decided not to restart');
			} else {
				self.startWss();
				self.log('maybeRestartWss restarted - ArrayBuffer did not send');			
			}
		}
	},
	wssOnOpen : function () { var self = _tsmSlackChromeExt;
		self.updateStatus('connected');
	    self.log("wssOnOpen");
	},
	wssOnClose : function () { var self = _tsmSlackChromeExt;
		self.updateStatus('disconnected');
		self.displayPanel('prefs');
	    self.log("wssOnClose");
	    self.maybeRestartWss();
	},
	wssOnError : function () { //wss
		//_tsmSlackChromeExt.updateStatus('disconnected');
		//_tsmSlackChromeExt.displayPanel('prefs');
	    _tsmSlackChromeExt.log("wssOnError");
		//_tsmSlackChromeExt.maybeRestartWss(); //wrap this in some logic to prevent infinite error loop
	},
	wssSend : function (data) { //wss
		//return "{'as_user':true,'type':'message','channel','"+channel+"', 'text':'"+message+"'}";
	},
	wssOnEvent : function (evt) { var self = _tsmSlackChromeExt;
	    var eObj = $.parseJSON(evt.data);
	    self.log("wssOnEvent evt.data "+evt.data);
	    //message filters: non-message, messages from self, and intial 'reply_to' messages
	    // && eObj.user !== _tsmSlackChromeExt.rtm.self.id
	    if ( eObj.type === 'message' && typeof eObj.reply_to === 'undefined' && eObj.user !== self.rtm.self.id ) {
	    	self.addToQueue(eObj);
	    } else if ( eObj.type === 'channel_marked' || eObj.type === 'group_marked' || eObj.type === 'im_marked' ) { //direct_message marked?
	    	self.unmarkChannel( eObj );
	    	self.updateStatus('message');
	    	self.active.panel = 'convo';
	    } else if ( eObj.type === 'presence_change' ) {
	    	self.updateObject(self.rtm.users, eObj, 'user');
	    	//re-sortUsers();
	    }
	},
	wssClose : function(){ var self = this;
		this.wss.onclose = function () {}; // disable onclose handler first
    	self.wss.close();
		self.updateStatus('logout');			
	},
	testWss: function(){ var self = this;
		self.log('testWss self.wss.readyState:'+self.wss.readyState);			
	},
	updateStatus : function ( state ) { var self = this; //state = good or bad
		self.has.auth = this.statuses[state].hasAuth;
		self.active.prefclass = this.statuses[state].prefclass;
		self.active.state = state;
		self.updateBadge(state);			
	},
	updateBadge : function( state ){ var self = _tsmSlackChromeExt;
		//check urgency statuses
		this.log('updateBadge '+state);

		//TODO: only count messages when its a message state
		var ct = self.getMessageCount();;
		//chrome.browserAction.setBadgeTitle({ title: this.statuses[state].message });
		chrome.browserAction.setBadgeText({ text: ct+this.statuses[state].suffix });
		chrome.browserAction.setBadgeBackgroundColor({ color:this.statuses[state].color }); //[155, 139, 187, 255]
  	},
  	//take fresh rtm  session data and pull out unread messages
  	importConvos : function(){ var self = this;
  		var c, i, l, co, ch = self.rtm.channels, im = self.rtm.ims, cSupp = 0, iSupp = 0;
  		var cObjects = ['channels', 'ims', 'groups'];
  		for ( co in cObjects ) {
  			var list = self.rtm[ cObjects[co] ];
			for ( l in list) { if (list[l].unread_count > 0 && list[l].latest.type === 'message' ) {
				self.log('importConvos match '+JSON.stringify(list[l]));
				var metaname = (list[l].is_im) ? list[l].user : list[l].name;// self.rtm.users.id[ims.user].real_name
				if ( cObjects[co] === 'ims' ) {self.rtm.usermeta[list[l].user] = { "id":list[l].user, "channel":list[l].user};
				self.rtm.convometa[list[l].id] = { "id":list[l].id, "label":metaname};
				self.createConvo( list[l] );
				var msg = list[l].latest;
				msg['channel'] = list[l].id;
				self.active.panel = 'convo';
				self.addToQueue(msg);	
			}}
		}
  	},
  	createConvo : function( arg ){ var self = this;
  		var lId = ( arg.type && arg.type === 'message' ) ? arg.channel : arg.id;
  		var lCt = ( arg.type && arg.type === 'message' ) ? 1 : (arg.unread_count - 1);
  		var newConvo = {
  			id : lId,
  			count : lCt, //will import latest and increment by one then
  			label : self.cPrefix[ lId.substring(0,1) ]+self.rtm.convometa[ lId ].label,
  			mention:0,
  			match:0
  		};
  		self.rtm.convos.push( newConvo );
  	},
  	// push message to queue
	addToQueue : function( message ){ var self = this;
		self.rtm.messages.push(message);
		self.updateConvo(message);
		console.log("messages"+JSON.stringify(self.rtm.messages));
  	},
	updateConvo: function( message ){ var self = this; //update convo.channel obj
		var cv = self.rtm.convos, type = 'message', m = {};
		//TODO: filter mentions and matches here
		var activeConvo = self.getObjectItem( cv, message.channel );
		if ( activeConvo ) {
			activeConvo.count++;
		} else {
			self.createConvo( message );
		}
		self.updateConvoCt();
		self.updateStatus(type);
		self.log("updateConvo convos: "+JSON.stringify(self.rtm.convos));
	},
  	// pull all messages from a read channel out of queue
	unmarkChannel : function( obj ){ var self = this;
		//self.rtm.state.has_mention = false;
		//self.rtm.state.has_match = false;
		var mQ = self.rtm.messages, newQ = [],
		i, channel = obj.channel;
		for (i = 0;i<mQ.length;i++) { 
			//self.log("unmark loop i:"+i+" :: "+JSON.stringify(mQ));
			if ( mQ[i].channel !== channel ) {
				newQ.push(mQ[i]);
			} else { //check kept messages for urgency
				self.urgencyCheck( mQ[i] );
			}
		}
		//clear self.convos
		//this.urgencyCheck();
		self.unmarkConvo( channel );
		self.rtm.messages = newQ;
		self.updateConvoCt();
  	},
  	unmarkConvo : function( id ){ var self = this;
  		var newC = [];
  		for (i = 0; i< self.rtm.convos.length; i++) { if ( self.rtm.convos[i].id !== id ) {
  			newC.push( self.rtm.convos[i] );
  		}}
		self.rtm.convos = newC;
  	},
  	//check message for any filter matches or <@uid> mentions
  	urgencyCheck : function( message ){ var self = this;
  		//self.rtm.self.prefs.highlight_words
  		//loop here checking for filter matches or <@uid> mentions
		//also re-map edited data to 
		return true;
		//self.rtm.state.has_mention = true;
		//self.rtm.state.has_match = true;
  	},
  	getMessageCount : function () { var self = this;
  		var ct = 0;
  		if ( self.rtm && self.rtm.convos ) { for (i = 0; i< self.rtm.convos.length; i++) {
  			ct = ( ct + self.rtm.convos[i].count );
  		}}
		//var mCt = ( typeof self.rtm === 'undefined' || typeof self.rtm.messages === 'undefined' ) ? 0 : self.rtm.messages.length;
		return (ct<1) ? "" : ( ct + "" );
  	},
  	saveAuth : function( payload ){
		this.log('handlePrefs called '+JSON.stringify(payload));
		this.prefs.authToken = payload.authToken;//this.prefs.userId = payload.userId;
		this.savePrefs();
		this.startWss( payload.authToken );
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
  	logConvos : function ( convo ){
		this.log('logConvo all convos '+JSON.stringify(this.rtm.convos));
  	},
  	clickConvo : function ( convo ){ var self = _tsmSlackChromeExt;
		this.log('clickConvo convo '+convo+ " - "+self.rtm.convometa[ convo ].label);
		//this.log('clickConvo all convos '+JSON.stringify(this.rtm.convos));
		self.active.convo = convo;
		self.displayPanel('reply');
  	},
  	/***************** HTML FUNCTIONS *****************************************/
  	// html switch panel
	displayPanel : function( clicked ){ var self = _tsmSlackChromeExt;
		self.active.panel = clicked;
		//this.log("displayPanel");
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
  	makeTime : function( ts ){
  		var d = new Date(parseFloat(ts) * 1000);
  		return d.toLocaleDateString();
  		//d.toLocaleTimeString()
  	},
  	panelUpdate : function( panel ){ //panelUpdate called to update data values when the user may be looking at the page 
  		return 'f';
  	},
  	panelRefresh : function ( panel ){ //panelRefresh called when panel switches
  		if ( this.popEnv() ) {
			var self = _tsmSlackChromeExt,
			jQ = self.jQ,
			w = self.popWin;
			switch( panel ) {
				case "prefs":
						jQ('section#prefs').find('main').attr('class', self.active.prefclass);
						jQ('section#prefs .detail').find('img.pic').attr('src', self.userdata.profile.image_48);
						jQ('section#prefs .detail').find('span.team').html(self.rtm.team.name);
						jQ('section#prefs .detail').find('span.uname').html(self.rtm.self.name);
						jQ('section#prefs .detail').find('span.highlight_words').html(self.rtm.self.prefs.highlight_words);

						//jQ('section#prefs').find('.user').html('');
						//jQ('section#prefs').find('.user').append('<img class="pic" src="'++'"><div><p>Team: <span class="team">'++'</span></p><p>You: <span class="uname">'++'</span></p><p>Highlight words: <span class="filterterms">'+self.rtm.self.prefs.highlight_words+'</span></p></div>');
					break;
				case "convo":
					self.updateConvoCt();
					var tablehtml = "", co = self.rtm.convos;
					for ( var c in co ) {
						tablehtml += '<tr id="'+co[c].id+'">';
						tablehtml += '<td class="col1"><span class="badge">'+co[c].count+'</span></td>';
						tablehtml += '<td class="col2"><a>'+co[c].label+'</a></td>';
						tablehtml += '<td class="col3"><a>'+co[c].mention+'</a></td>';
						tablehtml += '<td class="col4"><a>'+co[c].match+'</a></td></tr>';
					}
					jQ('section#convo').find('main tbody').html( tablehtml );
					break;
				case "users":
					jQ('section#users').find('main').html('');
					for ( var idx in self.rtm.users ){
						var data = self.rtm.users[idx];
						//if (data.unread_count > 0){
							jQ('section#users').find('main').append('<span class="team" id="'+data.id+'"><span class="badge">2</span><img title="'+data.name+'" data-id="'+data.id+'" src="'+data.profile.image_32+'" class="'+ data.presence + '"></span>');
						//}
					}

					break;
				case "reply":
					var cObj = self.getObjectItem(self.rtm.convos, self.active.convo );
					jQ('section#reply').find('h2').html( '<span class="badge">'+cObj.count+'</span>'+cObj.label );
					break;
			}
		}
  	},
  	//displayNewConvos
  	updateConvoCt : function (){
  		if ( this.popEnv() ) {
			var self = _tsmSlackChromeExt,
			jQ = self.jQ;
			jQ('section#convo').find('header h2 .badge').html( _tsmSlackChromeExt.getMessageCount() );
		}
  	},
  	removeConvoRow : function (id){
  		if ( this.popEnv() ) {
			var self = _tsmSlackChromeExt,
			jQ = self.jQ;
			jQ('section#convo').find('tr#'+id).remove;
		}
  	},
  	//////////// end UI HTML funcs /////////////////////
  	popEnv : function(){ return ( this.jQ !== null && this.popWin !== null ); },
  	unsetPopEnv : function(){ _tsmSlackChromeExt.popWin = null; _tsmSlackChromeExt.jQ = null; },
  	setPopEnv : function( w, jQ ){
  		_tsmSlackChromeExt.popWin = w; _tsmSlackChromeExt.jQ = jQ;
  		_tsmSlackChromeExt.displayPanel( _tsmSlackChromeExt.active.panel );

  	},
  	cPrefix : {'C':'#', 'G':'&gt;', 'D':'@'}, //convo id initials
  	has : { //new state object
  		auth : false,
  		connection : false,
  		message : false
  	},
  	active : { //display states
  		convo : false, //convo id, for reply page
  		chrome : true, //is chrome active?
  		state : 'preauth', //this is the h1 class on the prefs panel
  		panel : 'prefs', //unread, team, settings, (reply, groups, channels) //default panel in popup
  		prefclass : 'preauth' //h1 is on the prefs panel
  	},
  	hasAuth : false, //is current session authorized
	apiUrl : "https://slack.com/api/",
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
			suffix:''
		},
		init:{
			prefclass : 'init',
			hasAuth : false,
			panel:'prefs',
			message:'Initializing...',
			color:'#000',
			suffix:'...'
		},
		badsession:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			suffix:'!:!'
		},
		logout:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Your session has timed out',
			color:'#000',
			suffix:'!'
		},
		badtoken:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Invalid token',
			color:'#000',
			suffix:'!!'
		},
		unauthorized:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Auth has failed',
			color:'#000',
			suffix:'!!!'
		},
		disconnected:{
			prefclass : 'preauth',
			hasAuth : false,
			panel:'prefs',
			message:'Unable to Auth',
			color:'#000',
			suffix:'!!'
		},
		connected:{
			prefclass : 'active',
			hasAuth : true,
			panel:'users',
			message:'Connected to Slack',
			color:'#F66',
			suffix:''
		},
		message:{
			prefclass : 'active',
			hasAuth : true,
			panel:'convo',
			message:'Unread message',
			color:'#F66',
			suffix:''
		},
		filter:{
			prefclass : 'active',
			hasAuth : true,
			panel:'convo',
			message:'Unread filter match',
			color:'#F00',
			suffix:'#'
		},
		mention:{
			prefclass : 'active',
			hasAuth : true,
			panel:'convo',
			message:'Unread mention',
			color:'#F00',
			suffix:'@'
		}
	},
	log : function ( msg ){
		//console.log("log activePanel:"+this.activePanel+"\n\n"+msg );
		console.log( msg );
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
	//userId : 'U033Z49JK', //wolstat
	//authToken: "xoxp-3118431681-3168705663-4227973029-c967a2" //jzee
	//authToken : "xoxp-3118431681-3135145631-4229637403-9444ae", //wolstat

var convometa_map = {
	"channels":{
		"id":"id",
		"name":"name",
		"is_channel":"is_channel",
	},
	"ims":{
		"id":"id",
		"name": "users.id[ims.user].real_name",
		"is_im":"is_im",
	}

};
var example_rtm = {"ok":true,
"self":{"id":"U033Z49JK","name":"wolstat","prefs":{"highlight_words":"wolstat,mike","user_colors":"","color_names_in_list":true,"growls_enabled":true,"tz":"America/Indiana/Indianapolis","push_dm_alert":true,"push_mention_alert":true,"push_everything":true,"push_idle_wait":2,"push_sound":"b2.mp3","push_loud_channels":"","push_mention_channels":"","push_loud_channels_set":"","email_alerts":"instant","email_alerts_sleep_until":0,"email_misc":false,"email_weekly":true,"welcome_message_hidden":false,"all_channels_loud":false,"loud_channels":"G03HD7NF8,G03FE3E8A,C033GCPLP,C0458GXEA","never_channels":"","loud_channels_set":"G03HD7NF8,G03FE3E8A,C033GCPLP,C0458GXEA","show_member_presence":true,"search_sort":"timestamp","expand_inline_imgs":false,"expand_internal_inline_imgs":true,"expand_snippets":false,"posts_formatting_guide":true,"seen_welcome_2":true,"seen_ssb_prompt":false,"search_only_my_channels":false,"emoji_mode":"default","emoji_use":"{\"smile\":1,\"grimacing\":1,\"simple_smile\":1,\"ban\":1}","has_invited":false,"has_uploaded":true,"has_created_channel":true,"search_exclude_channels":"","messages_theme":"dense","webapp_spellcheck":true,"no_joined_overlays":true,"no_created_overlays":false,"dropbox_enabled":false,"seen_user_menu_tip_card":true,"seen_team_menu_tip_card":true,"seen_channel_menu_tip_card":true,"seen_message_input_tip_card":true,"seen_channels_tip_card":true,"seen_domain_invite_reminder":false,"seen_member_invite_reminder":false,"seen_flexpane_tip_card":true,"seen_search_input_tip_card":true,"mute_sounds":false,"arrow_history":false,"tab_ui_return_selects":true,"obey_inline_img_limit":true,"new_msg_snd":"complete_quest_requirement.mp3","collapsible":false,"collapsible_by_click":true,"require_at":false,"mac_ssb_bounce":"","mac_ssb_bullet":true,"expand_non_media_attachments":true,"show_typing":true,"pagekeys_handled":true,"last_snippet_type":"text","display_real_names_override":0,"time24":false,"enter_is_special_in_tbt":false,"graphic_emoticons":false,"convert_emoticons":true,"autoplay_chat_sounds":true,"ss_emojis":true,"sidebar_behavior":"","mark_msgs_read_immediately":true,"start_scroll_at_oldest":true,"snippet_editor_wrap_long_lines":false,"ls_disabled":false,"sidebar_theme":"monument_theme","sidebar_theme_custom_values":"{\"column_bg\":\"#0D7E83\",\"menu_bg\":\"#076570\",\"active_item\":\"#F79F66\",\"active_item_text\":\"#FFFFFF\",\"hover_item\":\"#D37C71\",\"text_color\":\"#FFFFFF\",\"active_presence\":\"#F79F66\",\"badge\":\"#F15340\"}","f_key_search":false,"k_key_omnibox":true,"speak_growls":false,"mac_speak_voice":"com.apple.speech.synthesis.voice.Alex","mac_speak_speed":250,"comma_key_prefs":false,"at_channel_suppressed_channels":"","push_at_channel_suppressed_channels":"","prompted_for_email_disabling":false,"full_text_extracts":false,"no_text_in_notifications":false,"muted_channels":"","no_macssb1_banner":true,"no_winssb1_banner":false,"privacy_policy_seen":true,"search_exclude_bots":false,"fuzzy_matching":false,"load_lato_2":false,"fuller_timestamps":false,"last_seen_at_channel_warning":0,"enable_flexpane_rework":false,"flex_resize_window":false,"msg_preview":false,"msg_preview_displaces":true,"msg_preview_persistent":true,"emoji_autocomplete_big":false,"winssb_run_from_tray":true,"email_compact_header":false,"two_factor_auth_enabled":false,"mentions_exclude_at_channels":true},"created":1417623497,"manual_presence":"active"},
"team":{"id":"T033GCPL1","name":"TSM Digital Products","email_domain":"townsquaredigital.com","domain":"tsmproducts","msg_edit_window_mins":-1,"prefs":{"default_channels":["C033GCPLP"],"disable_builtin_loading":true,"who_can_at_everyone":"regular","who_can_at_channel":"regular","who_can_post_general":"regular","who_can_create_channels":"regular","who_can_archive_channels":"admin","who_can_create_groups":"ra","who_can_kick_channels":"owner","who_can_kick_groups":"admin","services_only_admins":false,"commands_only_regular":true,"display_real_names":true,"require_at_for_mention":true,"msg_edit_window_mins":-1,"allow_message_deletion":true,"hide_referers":true,"warn_before_at_channel":"always","retention_type":0,"retention_duration":0,"group_retention_type":0,"group_retention_duration":0,"dm_retention_type":0,"dm_retention_duration":0,"compliance_export_start":0},"icon":{"image_34":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_34.jpg","image_44":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_44.jpg","image_68":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_68.jpg","image_88":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_88.jpg","image_102":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_102.jpg","image_132":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_132.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169312262_0fd829d0c6e1e196d083_original.jpg"},"over_storage_limit":false,"plan":"std"},"latest_event_ts":"1428411548.000000",
"channels":[
{"id":"C0350HMMG",
"name":"2015capexqa",
"is_channel":true,
"created":1418057433,
"creator":"U033Z341Z",
"is_archived":false,
"is_general":false,
"is_member":true,
"last_read":"1428353010.000054",
"latest":{"type":"message",
"user":"U033Z49JK",
"text":"yeah",
"ts":"1428353010.000054"},
"unread_count":0,"unread_count_display":0,
"members":["U033Z341Z","U033Z49JK","U033Z4QPM","U035917C2"],
"topic":{"value":"https://projects.townsquaredigital.com/projects/capex-system/",
"creator":"U035917C2","last_set":1418671917},
"purpose":{"value":"","creator":"","last_set":0}},

{"id":"C03404MJX","name":"2015hrsystem","is_channel":true,"created":1417632451,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_starred":true,"is_member":true,"last_read":"1428006351.000024",
	"latest":{"type":"message","user":"U033Z341Z","text":"cool","ts":"1428006351.000024"},
	"unread_count":0,"unread_count_display":0,"members":["U033Z341Z","U033Z49JK","U033Z4QPM","U035917C2","U03ANVBRK"],"topic":{"value":"http://labtickets.meteor.com/products/YbMHDEuMG3u36ogCu/","creator":"U035917C2","last_set":1424279244},"purpose":{"value":"","creator":"","last_set":0}},
{"id":"C03JADC88","name":"2015tradesystem","is_channel":true,"created":1423098909,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":true,"last_read":"1425929709.000029","latest":{"text":"*[Approved totals endpoint]* by _Mike Wolstat_ \n<http://labtickets.meteor.com/features/a6jozSuoHohPv8LwS>\n<https://townsquarelab.com/capital/#/2015/dash/approved>","username":"produx®","bot_id":"B03EAPT74","type":"message","subtype":"bot_message","ts":"1425929709.000029"},"unread_count":0,"unread_count_display":0,"members":["U033Z341Z","U033Z49JK","U033Z4QPM"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"","creator":"","last_set":0}},{"id":"C03J6L79S","name":"4-0-design","is_channel":true,"created":1423076593,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C03HDAQ4P","name":"ademopublic","is_channel":true,"created":1422906735,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C03CCSMJ1","name":"america-on-tap-app","is_channel":true,"created":1421337711,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C03CEGST1","name":"analytics","is_channel":true,"created":1421346551,"creator":"U035917C2","is_archived":false,"is_general":false,"is_member":false},{"id":"C045YG6LS","name":"anthony-test2","is_channel":true,"created":1427485245,"creator":"U03ANVBRK","is_archived":false,"is_general":false,"is_member":false},{"id":"C03C596L9","name":"asana-feed-test","is_channel":true,"created":1421272692,"creator":"U033GCPL5","is_archived":true,"is_general":false,"is_member":false},{"id":"C0460N7J8","name":"blahblahblah","is_channel":true,"created":1427492593,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C03G31Z8M","name":"collab-room","is_channel":true,"created":1422485807,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":true,"last_read":"1427919113.000081","latest":{"type":"message","user":"U0352BZE1","text":"attachment works","ts":"1427919113.000081"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U033Z4QPM","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034YU29X","U034Z189D","U034Z2117","U0350DX5S","U0350G96N","U0350N66G","U03520E43","U0352BZE1","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03CSGXU8","U03F8GXRF","U03FADGLH","U03FAK08J","U03GH4YR4"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"Forum to post problems and issues for group problem solving and innovation","creator":"U033GCPL5","last_set":1422485807}},{"id":"C046JSNLR","name":"converseallstars","is_channel":true,"created":1427479719,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C033GCPLP","name":"general-team","is_channel":true,"created":1417446266,"creator":"U033GCPL5","is_archived":false,"is_general":true,"is_member":true,"last_read":"1428365887.000529","latest":{"type":"message","user":"U034Z2117","text":"doing a software update and rebooting...","ts":"1428412058.000530"},"unread_count":1,"unread_count_display":1,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U033Z4QPM","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350N66G","U0352BZE1","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03CSGXU8","U03F8GXRF","U03FADGLH","U03FAK08J","U03FKE27V","U03GH4YR4","U03PVE5PH","U045TMWF7","U046GMUEH"],"topic":{"value":"http://j.mp/tsmdp-links","creator":"U034LQWPY","last_set":1424706963},"purpose":{"value":"This channel is for team-wide communication and announcements. All team members are in this channel.","creator":"","last_set":0}},{"id":"C0465N5TY","name":"gitlabbot","is_channel":true,"created":1427547761,"creator":"U0363LD25","is_archived":false,"is_general":false,"is_member":false},{"id":"C03HRHVJ8","name":"harrysapitest","is_channel":true,"created":1422979740,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046QGH89","name":"ign-asdasd-qweqwe","is_channel":true,"created":1427495338,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046QGJ1P","name":"ign-asdasd-qweqwe-1","is_channel":true,"created":1427495346,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046QUQMT","name":"ign-democampaign","is_channel":true,"created":1427497542,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C0463BF9S","name":"ign-democampaigner","is_channel":true,"created":1427510036,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046R79PA","name":"ign-ignitecampaign","is_channel":true,"created":1427734816,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C0463639U","name":"ign-jrwhopper","is_channel":true,"created":1427508109,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C047E6D7F","name":"ign-prepresentationde","is_channel":true,"created":1427732128,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046QPX13","name":"ign-testing","is_channel":true,"created":1427496669,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C046Q8ECM","name":"ignite-asdasd-qweqwe","is_channel":true,"created":1427493894,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C04619C40","name":"ignite-asdasd-qweqwe-","is_channel":true,"created":1427495092,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C0357KCH9","name":"ignite-public","is_channel":true,"created":1418136622,"creator":"U034LQWPY","is_archived":false,"is_general":false,"is_member":false},{"id":"C03DMHMRK","name":"issue-tracker","is_channel":true,"created":1421781061,"creator":"U034YTEQK","is_archived":false,"is_general":false,"is_member":false},{"id":"C046GHCH7","name":"johnk-api-test","is_channel":true,"created":1427471661,"creator":"U039AAUV9","is_archived":false,"is_general":false,"is_member":false},{"id":"C03FB9N0F","name":"lab-node-release","is_channel":true,"created":1422308680,"creator":"U033Z49JK","is_archived":false,"is_general":false,"is_starred":true,"is_member":true,"last_read":"1428077557.000018","latest":{"type":"message","user":"U033Z49JK","text":"deployed 446","ts":"1428077557.000018"},"unread_count":0,"unread_count_display":0,"members":["U033Z341Z","U033Z49JK","U0399J1QD","U03ANVBRK","U03AP3LNV"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"","creator":"","last_set":0}},{"id":"C03HE4T87","name":"labcampaigns","is_channel":true,"created":1422911339,"creator":"U033Z341Z","is_archived":false,"is_general":false,"is_member":false},{"id":"C03FN5TRE","name":"newsletters","is_channel":true,"created":1422374567,"creator":"U03FKE27V","is_archived":false,"is_general":false,"is_member":false},{"id":"C03DPGV8R","name":"open-bugs","is_channel":true,"created":1421792575,"creator":"U035917C2","is_archived":false,"is_general":false,"is_member":false},{"id":"C033GCPM1","name":"random","is_channel":true,"created":1417446266,"creator":"U033GCPL5","is_archived":true,"is_general":false,"is_member":false},{"id":"C0458GXEA","name":"slack-project-1","is_channel":true,"created":1427369871,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":true,"last_read":"1428411644.001322","latest":{"type":"message","user":"U0352BZE1","text":"test","ts":"1428412070.001323"},"unread_count":1,"unread_count_display":1,"members":["U033GCPL5","U033J331Q","U033Z49JK","U034YLRKH","U0352BZE1","U03PVE5PH"],"topic":{"value":"TEAM COFFEE","creator":"U033Z49JK","last_set":1427467795},"purpose":{"value":"Project:  Chrome plugin showing slack updates (notifications number count and direct messages)","creator":"U033GCPL5","last_set":1427369872}},{"id":"C045XMBN9","name":"slack-project-2","is_channel":true,"created":1427370044,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C045XNE99","name":"slack-project-3","is_channel":true,"created":1427370289,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C045XNHNM","name":"slack-project-4","is_channel":true,"created":1427370319,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C0458K266","name":"slack-project-5","is_channel":true,"created":1427370344,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C0458K9EG","name":"slack-project-6","is_channel":true,"created":1427370371,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C045XPEBV","name":"slack-project-7","is_channel":true,"created":1427370476,"creator":"U033GCPL5","is_archived":false,"is_general":false,"is_member":false},{"id":"C0414R32S","name":"social-vip-overlays","is_channel":true,"created":1426256311,"creator":"U033J331Q","is_archived":false,"is_general":false,"is_member":false},{"id":"C03A55FTZ","name":"test-channel","is_channel":true,"created":1420569755,"creator":"U033GCPL5","is_archived":true,"is_general":false,"is_member":false},{"id":"C044EV265","name":"test-sow","is_channel":true,"created":1427142880,"creator":"U0399J1QD","is_archived":false,"is_general":false,"is_member":false},{"id":"C03T66YQZ","name":"thelabdev","is_channel":true,"created":1425492602,"creator":"U033Z49JK","is_archived":false,"is_general":false,"is_member":true,"last_read":"1426898612.000011","latest":{"type":"message","user":"U033Z49JK","text":"cool","ts":"1426898612.000011"},"unread_count":0,"unread_count_display":0,"members":["U033Z341Z","U033Z49JK","U033Z4QPM","U035917C2"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"A channel for all lab products","creator":"U033Z49JK","last_set":1425492602}},{"id":"C03906TU8","name":"tsm-sponsorships","is_channel":true,"created":1419883553,"creator":"U035NEGDL","is_archived":false,"is_general":false,"is_member":false},{"id":"C03DM5HTX","name":"writeup-list","is_channel":true,"created":1421778760,"creator":"U034YTEQK","is_archived":true,"is_general":false,"is_member":false}],"groups":[{"id":"G03C4T7HR","name":"server-status","is_group":true,"created":1421270399,"creator":"U033GCPL5","is_archived":false,"is_open":true,"last_read":"1428327478.000414","latest":{"type":"message","user":"U033J331Q","text":"Yeah seems so","ts":"1428327478.000414"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033J331Q","U033Z49JK","U034K5X29","U034YLRKH","U034YTEQK","U034Z189D","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"","creator":"","last_set":0}},{"id":"G03C4TP0R","name":"slack-feedback","is_group":true,"created":1421270476,"creator":"U033GCPL5","is_archived":false,"is_open":true,"last_read":"1421270476.000018","latest":{"type":"message","user":"USLACKBOT","text":"<!group>: The import of this group from the #slack-feedback channel is complete.","ts":"1421270476.000018"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U033Z4QPM","U034K5X29","U034YLRKH","U034YTEQK","U034Z2117","U035917C2","U0363LD25"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"Where we can post about the good &amp;amp; bad aspects of using slack over skype","creator":"U033GCPL5","last_set":1421270476}},{"id":"G041317SR","name":"thanks_jose","is_group":true,"created":1426259203,"creator":"U034LQWPY","is_archived":false,"is_open":true,"last_read":"1426518877.000155","latest":{"user":"U03CSGXU8","type":"message","subtype":"group_leave","text":"<@U03CSGXU8|ericwedge> has left the group","ts":"1426518877.000155"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U033Z4QPM","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350DX5S","U0350G96N","U0350N66G","U03520E43","U0352BZE1","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03F8GXRF","U03F8K3HT","U03FADGLH","U03FAK08J","U03GH4YR4","U03PVE5PH"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"","creator":"","last_set":0}},{"id":"G041AL4M2","name":"tsm-product-roadmap","is_group":true,"created":1426282583,"creator":"U033GCPL5","is_archived":false,"is_open":true,"last_read":"1426520932.000032","latest":{"user":"U0399J1QD","inviter":"U034YTEQK","type":"message","subtype":"group_join","text":"<@U0399J1QD|sowmiya> has joined the group","ts":"1426520932.000032"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350G96N","U0350N66G","U03520E43","U0352BZE1","U035917C2","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03CSGXU8","U03F8GXRF","U03FADGLH","U03FAK08J","U03GH4YR4","U03PVE5PH"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"Forum to share and discuss our overall product roadmap plans.  Roadmap: https://app.roadmunk.com/publish/462fd2899f92aa03f65a7f20755f7e9489359e92  (digitalproducts)","creator":"U033GCPL5","last_set":1426517680}},{"id":"G03F8RAUZ","name":"tsm-release","is_group":true,"created":1422294788,"creator":"U033J331Q","is_archived":false,"is_open":true,"last_read":"1428355670.000098","latest":{"type":"message","user":"U034Z189D","text":"you need it?","ts":"1428355670.000098"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033J331Q","U033Z341Z","U033Z49JK","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350DX5S","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03F8GXRF","U03FADGLH"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"All Code Deployments will be announced here.","creator":"U033J331Q","last_set":1422294790}},{"id":"G03C6T9RW","name":"water-cooler","is_group":true,"created":1421270421,"creator":"U033J331Q","is_archived":false,"is_open":true,"last_read":"1428087146.000413","latest":{"type":"message","user":"U035NEGDL","text":"easter!!!","ts":"1428087146.000413"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034YU29X","U034Z189D","U034Z2117","U0350DX5S","U0350G96N","U0350N66G","U0352BZE1","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03F8GXRF","U03FADGLH","U03FKE27V","U03PVE5PH"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"A place for non-work banter, links, articles of interest, humor or anything else which you'd like concentrated in some place other than work-related channels.","creator":"U033J331Q","last_set":1421270421}},{"id":"G03FE3E8A","name":"weekly-call-dev-sys","is_group":true,"created":1422311414,"creator":"U033J331Q","is_archived":false,"is_open":true,"last_read":"1428335821.000161","latest":{"type":"message","user":"U034K5X29","text":"<http://thenewsherald.com/articles/2013/03/31/news/doc5155f0e81b855927255529.txt>","attachments":[{"service_name":"The News Herald - Serving Southgate, MI","title":"TRENTON: Thousands flock to Elizabeth Park for annual Marshmallow Drop","title_link":"http://thenewsherald.com/articles/2013/03/31/news/doc5155f0e81b855927255529.txt","text":"TRENTON: Thousands flock to Elizabeth Park for annual Marshmallow Drop - TRENTON — The sun was bright, the air was comfortably crisp and the marshmallows were plentiful.","fallback":"The News Herald - Serving Southgate, MI: TRENTON: Thousands flock to Elizabeth Park for annual Marshmallow Drop","image_url":"http://www.thenewsherald.com/content/articles/2013/03/31/news/doc5155f0e81b855927255529.jpg","from_url":"http://thenewsherald.com/articles/2013/03/31/news/doc5155f0e81b855927255529.txt","image_width":377,"image_height":250,"image_bytes":31060,"id":1}],"ts":"1428335821.000161"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033J331Q","U033Z341Z","U033Z49JK","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350DX5S","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03CSGXU8","U03F8GXRF","U03FADGLH"],"topic":{"value":"","creator":"","last_set":0},"purpose":{"value":"Reserved for Weekly Call with Dev, Systems &amp; QA Team","creator":"U033J331Q","last_set":1422311417}},{"id":"G03HD7NF8","name":"weekly-team-meeting","is_group":true,"created":1422894377,"creator":"U033GCPL5","is_archived":false,"is_open":true,"last_read":"1427731679.000004","latest":{"type":"message","user":"U033Z49JK","text":"slackUserID:apiToken","ts":"1427731679.000004"},"unread_count":0,"unread_count_display":0,"members":["U033GCPL5","U033GHMQX","U033H5T9X","U033J331Q","U033Z341Z","U033Z49JK","U033Z4QPM","U034K5X29","U034LQWPY","U034YLRKH","U034YTEQK","U034Z189D","U034Z2117","U0350DX5S","U0350G96N","U0350N66G","U03520E43","U0352BZE1","U035917C2","U035NEGDL","U0363LD25","U0399J1QD","U039AAUV9","U03ANV93M","U03ANVBRK","U03AP3LNV","U03CSGXU8","U03F8GXRF","U03FADGLH","U03FAK08J","U03GH4YR4","U03PVE5PH"],"topic":{"value":"Call info: 559-726-1300 / ID: 158114","creator":"U0363LD25","last_set":1422895053},"purpose":{"value":"Meeting to review weekly team updates, tasks and news:  Call info: 559-726-1300 / ID: 158114","creator":"U033GCPL5","last_set":1422895152}}],


"ims":[
{"id":"D033Z49JR",
"is_im":true,
"user":"USLACKBOT",
"created":1417623497,
"last_read":"1421950826.000015",
"latest":{"text":"wolstat- [HR: Cleanup Market Dashboard] Has been assigned to you by Harry Ward <http://labtickets.meteor.com/features/X6qCNLkrkdkadpcfR>",
"username":"produx®",
"bot_id":"B03EAPT74",
"type":"message","subtype":"bot_message","ts":"1421950826.000015"},
"unread_count":0,"unread_count_display":0,"is_open":true},
{"id":"D033Z49JX","is_im":true,"user":"U033GCPL5","created":1417623497,"last_read":"1426105883.000003","latest":{"type":"message","user":"U033Z49JK","text":"yeah","ts":"1426105883.000003"},"unread_count":0,"unread_count_display":0,"is_open":true},
{"id":"D033Z49JZ","is_im":true,"user":"U033GHMQX","created":1417623497,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},
{"id":"D033Z49K3","is_im":true,"user":"U033H5T9X","created":1417623497,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D033Z49K7","is_im":true,"user":"U033J331Q","created":1417623497,"last_read":"1428091513.000004","latest":{"type":"message","user":"U033J331Q","text":"foo","ts":"1428091513.000004"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D033Z49K5","is_im":true,"user":"U033Z341Z","created":1417623497,"is_starred":true,"last_read":"1427826385.000008","latest":{"type":"message","user":"U033Z341Z","text":"tsting","ts":"1427826385.000008"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D033Z4QQP","is_im":true,"user":"U033Z4QPM","created":1417623668,"last_read":"1418953445.000031","latest":{"type":"message","user":"U033Z4QPM","text":"about to push a change to prod","ts":"1418953445.000031"},"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D034K5X3M","is_im":true,"user":"U034K5X29","created":1417807041,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D034LQWQJ","is_im":true,"user":"U034LQWPY","created":1417808008,"last_read":"1427808012.000021","latest":{"type":"message","user":"U034LQWPY","text":"thanks","ts":"1427808012.000021"},"unread_count":0,"unread_count_display":0,"is_open":true},
{"id":"D034YLRL1","is_im":true,"user":"U034YLRKH","created":1418054977,"last_read":"1428091088.000104","latest":{"type":"message","user":"U033Z49JK","text":"thanks","ts":"1428091088.000104"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D034YTER1","is_im":true,"user":"U034YTEQK","created":1418056507,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D034YU2AD","is_im":true,"user":"U034YU29X","created":1418056633,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D046095GE","is_im":true,"user":"U034Z2117","created":1427490574,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D0350DX6L","is_im":true,"user":"U0350DX5S","created":1418056594,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D0350G97Y","is_im":true,"user":"U0350G96N","created":1418057155,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D0350N67Q","is_im":true,"user":"U0350N66G","created":1418058510,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D03520E4K","is_im":true,"user":"U03520E43","created":1418078186,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D0352BZE7","is_im":true,"user":"U0352BZE1","created":1418081322,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D038G3AEW","is_im":true,"user":"U035917C2","created":1419437963,"last_read":"1426103078.000005","latest":{"type":"message","user":"U035917C2","text":"hhaha","ts":"1426103078.000005"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D035NEGFQ","is_im":true,"user":"U035NEGDL","created":1418248039,"last_read":"1427486385.000036","latest":{"type":"message","user":"U033Z49JK","text":"so far so good","ts":"1427486385.000036"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D0363LD2R","is_im":true,"user":"U0363LD25","created":1418402871,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false},{"id":"D041VRQE8","is_im":true,"user":"U03AP3LNV","created":1426510262,"last_read":"1426540927.000020","latest":{"type":"message","user":"U033Z49JK","text":"nice","ts":"1426540927.000020"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D040V32DN","is_im":true,"user":"U03FADGLH","created":1426192511,"last_read":"1426194298.000037","latest":{"type":"message","user":"U033Z49JK","text":"ducking out, ttyl","ts":"1426194298.000037"},"unread_count":0,"unread_count_display":0,"is_open":true},{"id":"D03FAK0AC","is_im":true,"user":"U03FAK08J","created":1422292058,"last_read":"0000000000.000000","latest":null,"unread_count":0,"unread_count_display":0,"is_open":false}],


"convos":[
	{"id":"C0458GXEA", 'name':'blaj', 'count':2, 'mention':true, 'match':false}, //id:count 
	{"id":"D034YLRL1", 'name':'foo', 'count':1, 'mention':false, 'match':false}
],
"messages":[
	{"type":"message","channel":"C0458GXEA","user":"U033J331Q","text":"again","ts":"1428091509.001186","team":"T033GCPL1"},
	{"type":"message","channel":"D033Z49K7","user":"U033J331Q","text":"foo","ts":"1428091513.000004","team":"T033GCPL1"},
	{"type":"message","channel":"C0458GXEA","user":"U033J331Q","text":"<@U033Z49JK>: just in case!","ts":"1428092507.001192","team":"T033GCPL1"}
],
"state": {unread_count : 0, has_mention : false, has_match : false}, //updated here
"users":[{"id":"U034YTEQK","name":"adamjermstad","deleted":false,"status":null,"color":"99a949","real_name":"Adam Jermstad","tz":"America/Chicago","tz_label":"Central Daylight Time","tz_offset":-18000,"profile":{"first_name":"Adam","last_name":"Jermstad","title":"QA Lead","skype":"adamjermstad","phone":"5127390820","real_name":"Adam Jermstad","real_name_normalized":"Adam Jermstad","email":"adam@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/218c799b6cd3cd787d2e20eeba97ab32.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0012-24.png","image_32":"https://secure.gravatar.com/avatar/218c799b6cd3cd787d2e20eeba97ab32.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0012-32.png","image_48":"https://secure.gravatar.com/avatar/218c799b6cd3cd787d2e20eeba97ab32.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0012-48.png","image_72":"https://secure.gravatar.com/avatar/218c799b6cd3cd787d2e20eeba97ab32.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0012-72.png","image_192":"https://secure.gravatar.com/avatar/218c799b6cd3cd787d2e20eeba97ab32.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0012.png"},"is_admin":true,"is_owner":true,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"active"},{"id":"U0352BZE1","name":"adrianborromeo","deleted":false,"status":null,"color":"235e5b","real_name":"Adrian Borromeo","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Adrian","last_name":"Borromeo","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-18/3251232646_ba2be88b9a77f19873d3_original.jpg","title":"Design and Draw","skype":"adrian.borromeo4","phone":"","real_name":"Adrian Borromeo","real_name_normalized":"Adrian Borromeo","email":"adrianb@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"active"},{"id":"U0350G96N","name":"agrezda64","deleted":false,"status":null,"color":"9b3b45","real_name":"Adrian Grezda","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Adrian","last_name":"Grezda","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3529825233_3fb02d56f3bef02eb597_original.jpg","title":"","skype":"adrian.grezda","phone":"(516) 581-7095","real_name":"Adrian Grezda","real_name_normalized":"Adrian Grezda","email":"adrian@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U033J331Q","name":"anibal","deleted":false,"status":null,"color":"e7392d","real_name":"Anibal Rosado","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Anibal","last_name":"Rosado","skype":"anibal.rosado2","title":"VP, Digital Products","phone":"9178653103","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169286770_090cdc870fa805a5d1c6_original.jpg","real_name":"Anibal Rosado","real_name_normalized":"Anibal Rosado","email":"anibal@townsquaredigital.com"},"is_admin":true,"is_owner":true,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03ANVBRK","name":"anthony","deleted":false,"status":null,"color":"ea2977","real_name":"Anthony Ciaravalo","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Anthony","last_name":"Ciaravalo","title":"stuff","skype":"ciaravalo","phone":"9732078703","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3533904292_b65959a31106213a0cbc_original.jpg","real_name":"Anthony Ciaravalo","real_name_normalized":"Anthony Ciaravalo","email":"anthony@townsquaredigital.com"},"is_admin":true,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03LL4BNB","name":"beast","deleted":false,"status":null,"color":"8d4b84","real_name":"Tim Pirrone","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Tim","last_name":"Pirrone","real_name":"Tim Pirrone","real_name_normalized":"Tim Pirrone","email":"tim.pirrone@townsquaremedia.com","image_24":"https://secure.gravatar.com/avatar/677707b5ce77f871a5e2dcd0d220bc2c.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0015-24.png","image_32":"https://secure.gravatar.com/avatar/677707b5ce77f871a5e2dcd0d220bc2c.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0015-32.png","image_48":"https://secure.gravatar.com/avatar/677707b5ce77f871a5e2dcd0d220bc2c.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0015-48.png","image_72":"https://secure.gravatar.com/avatar/677707b5ce77f871a5e2dcd0d220bc2c.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0015-72.png","image_192":"https://secure.gravatar.com/avatar/677707b5ce77f871a5e2dcd0d220bc2c.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0015.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":true,"is_ultra_restricted":true,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U03F8K3HT","name":"bill.reinhart","deleted":false,"status":null,"color":"902d59","real_name":"Bill Reinhart","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Bill","last_name":"Reinhart","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-26/3518743459_8b1ce781c62c5f9b0090_original.jpg","real_name":"Bill Reinhart","real_name_normalized":"Bill Reinhart","email":"bill.reinhart@townsquareinteractive.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":true,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U0363LD25","name":"bradley","deleted":false,"status":null,"color":"c386df","real_name":"Bradley Cicenas","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-30/3311456021_8606d03e2762d46aa24a_original.jpg","first_name":"Bradley","last_name":"Cicenas","title":"","skype":"bcicenas","phone":"312.890.2048","real_name":"Bradley Cicenas","real_name_normalized":"Bradley Cicenas","email":"bradley@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U034LQWPY","name":"cgstadler","deleted":false,"status":null,"color":"5b89d5","real_name":"Christian Stadler","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Christian","last_name":"Stadler","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3169622486_7e1d92107e98fbfc3368_original.jpg","skype":"cgstadler","phone":"6462219544","title":"Director of Digital Products","real_name":"Christian Stadler","real_name_normalized":"Christian Stadler","email":"christian@townsquaredigital.com"},"is_admin":true,"is_owner":true,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03GH4YR4","name":"cliff","deleted":false,"status":null,"color":"3c8c69","real_name":"Cliff Washington","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Cliff","last_name":"Washington","real_name":"Cliff Washington","real_name_normalized":"Cliff Washington","email":"cliff@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/4c36112f4ad048f206a3bd2228486607.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023-24.png","image_32":"https://secure.gravatar.com/avatar/4c36112f4ad048f206a3bd2228486607.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0023-32.png","image_48":"https://secure.gravatar.com/avatar/4c36112f4ad048f206a3bd2228486607.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0023-48.png","image_72":"https://secure.gravatar.com/avatar/4c36112f4ad048f206a3bd2228486607.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023-72.png","image_192":"https://secure.gravatar.com/avatar/4c36112f4ad048f206a3bd2228486607.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U033GHMQX","name":"cody.rotwein","deleted":false,"status":null,"color":"4bbe2e","real_name":"Cody Rotwein","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Cody","last_name":"Rotwein","title":"","skype":"cody.rotwein","phone":"","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-30/3571911046_c84aded6ea8362c97fdf_original.jpg","real_name":"Cody Rotwein","real_name_normalized":"Cody Rotwein","email":"cody@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"active"},{"id":"U034Z2117","name":"dannel","deleted":false,"status":null,"color":"bb86b7","real_name":"Dannel Albert","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Dannel","last_name":"Albert","title":"","skype":"cubenerd","phone":"","real_name":"Dannel Albert","real_name_normalized":"Dannel Albert","email":"dannel@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/e09db5941ee890d9800c07eed4b3ee2e.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0002-24.png","image_32":"https://secure.gravatar.com/avatar/e09db5941ee890d9800c07eed4b3ee2e.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0002-32.png","image_48":"https://secure.gravatar.com/avatar/e09db5941ee890d9800c07eed4b3ee2e.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0002-48.png","image_72":"https://secure.gravatar.com/avatar/e09db5941ee890d9800c07eed4b3ee2e.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0002-72.png","image_192":"https://secure.gravatar.com/avatar/e09db5941ee890d9800c07eed4b3ee2e.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0002.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U0350N66G","name":"dbalogh","deleted":false,"status":null,"color":"5a4592","real_name":"David Balogh","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3171458345_7f8f74354bb53c7c4854_original.jpg","first_name":"David","last_name":"Balogh","skype":"plstcmnds","phone":"646-327-7503","title":"Art Director","real_name":"David Balogh","real_name_normalized":"David Balogh","email":"david@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"active"},{"id":"U03FADGLH","name":"dean","deleted":false,"status":null,"color":"a2a5dc","real_name":"Dean Wallace","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Dean","last_name":"Wallace","title":"","skype":"leanmeandean","phone":"","real_name":"Dean Wallace","real_name_normalized":"Dean Wallace","email":"dean@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/beb6c31ca6171c56e355f365f9d20dd5.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0021-24.png","image_32":"https://secure.gravatar.com/avatar/beb6c31ca6171c56e355f365f9d20dd5.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0021-32.png","image_48":"https://secure.gravatar.com/avatar/beb6c31ca6171c56e355f365f9d20dd5.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0021-48.png","image_72":"https://secure.gravatar.com/avatar/beb6c31ca6171c56e355f365f9d20dd5.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0021-72.png","image_192":"https://secure.gravatar.com/avatar/beb6c31ca6171c56e355f365f9d20dd5.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0021.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U03CH68GD","name":"dgraham","deleted":false,"status":null,"color":"d55aef","real_name":"Dan Graham","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Dan","last_name":"Graham","real_name":"Dan Graham","real_name_normalized":"Dan Graham","email":"dan.graham@opticnectar.com","image_24":"https://secure.gravatar.com/avatar/849976249c881d2a99c58453029a36fd.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0013-24.png","image_32":"https://secure.gravatar.com/avatar/849976249c881d2a99c58453029a36fd.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0013-32.png","image_48":"https://secure.gravatar.com/avatar/849976249c881d2a99c58453029a36fd.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0013-48.png","image_72":"https://secure.gravatar.com/avatar/849976249c881d2a99c58453029a36fd.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0013-72.png","image_192":"https://secure.gravatar.com/avatar/849976249c881d2a99c58453029a36fd.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0013.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":true,"is_ultra_restricted":true,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U03ANV93M","name":"eric","deleted":false,"status":null,"color":"5870dd","real_name":"Eric Tsuei","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-08/3363005245_9bf4c4e6447ab7a6d92b_original.jpg","first_name":"Eric","last_name":"Tsuei","title":"","skype":"etsuei82","phone":"","real_name":"Eric Tsuei","real_name_normalized":"Eric Tsuei","email":"eric@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U03CSGXU8","name":"ericwedge","deleted":false,"status":null,"color":"43761b","real_name":"Eric Wedge","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Eric","last_name":"Wedge","title":"","skype":"ericjwedge","phone":"703-342-2325","real_name":"Eric Wedge","real_name_normalized":"Eric Wedge","email":"eric.wedge@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/afe02bd37c9836986644e66cdd44c239.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023-24.png","image_32":"https://secure.gravatar.com/avatar/afe02bd37c9836986644e66cdd44c239.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0023-32.png","image_48":"https://secure.gravatar.com/avatar/afe02bd37c9836986644e66cdd44c239.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0023-48.png","image_72":"https://secure.gravatar.com/avatar/afe02bd37c9836986644e66cdd44c239.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023-72.png","image_192":"https://secure.gravatar.com/avatar/afe02bd37c9836986644e66cdd44c239.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0023.png"},"is_admin":true,"is_owner":true,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U033Z341Z","name":"harryward","deleted":false,"status":null,"color":"674b1b","real_name":"Harry Ward","tz":"America/Los_Angeles","tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"first_name":"Harry","last_name":"Ward","title":"Digital Product Manager/Developer","skype":"townsquareharry","phone":"4063708271","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-02-02/3588994019_37e0de54159df70ff404_original.jpg","real_name":"Harry Ward","real_name_normalized":"Harry Ward","email":"harry@townsquaredigital.com"},"is_admin":true,"is_owner":true,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03PVE5PH","name":"jacknealy_tsm","deleted":false,"status":null,"color":"84b22f","real_name":"Jack Nealy","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Jack","last_name":"Nealy","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_72.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-24/4161582463_870c4250fcd9eb6899f9_original.jpg","real_name":"Jack Nealy","real_name_normalized":"Jack Nealy","email":"jack@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U035917C2","name":"jdbecht","deleted":false,"status":null,"color":"9e3997","real_name":"JD Becht","tz":"America/Chicago","tz_label":"Central Daylight Time","tz_offset":-18000,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-09/3177517519_4e76249ddf96ec33475b_original.jpg","first_name":"JD","last_name":"Becht","title":"QA, TSM Support","skype":"jdbecht","phone":"812-677-0631","real_name":"JD Becht","real_name_normalized":"JD Becht","email":"jd.becht@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U039AAUV9","name":"johnk","deleted":false,"status":null,"color":"a63024","real_name":"John Kim","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"John","last_name":"Kim","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-31/3317417454_821b917e144833e41f09_original.jpg","title":"","skype":"john.kimz","phone":"","real_name":"John Kim","real_name_normalized":"John Kim","email":"john@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U046GMUEH","name":"johnkbots","deleted":false,"status":null,"color":"e23f99","real_name":"","tz":null,"tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"bot_id":"B046GMUE5","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-27/4220742823_d20f44b52bf4e3f83b3f_original.jpg","real_name":"","real_name_normalized":""},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":true,"has_files":false,"presence":"away"},{"id":"U033H5T9X","name":"jonnygnyc","deleted":false,"status":null,"color":"3c989f","real_name":"Jon Gamel","tz":"America/Los_Angeles","tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3137886452_90ee3b66924b348aa611_original.jpg","first_name":"Jon","last_name":"Gamel","real_name":"Jon Gamel","real_name_normalized":"Jon Gamel","email":"jon@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03CMQTJ4","name":"joshuanovak919","deleted":false,"status":null,"color":"d1707d","real_name":"Josh Novak","tz":"America/Los_Angeles","tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"first_name":"Josh","last_name":"Novak","real_name":"Josh Novak","real_name_normalized":"Josh Novak","email":"josh.novak@opticnectar.com","image_24":"https://secure.gravatar.com/avatar/602a16860e9a58e693b70e153b463e42.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0001-24.png","image_32":"https://secure.gravatar.com/avatar/602a16860e9a58e693b70e153b463e42.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0001-32.png","image_48":"https://secure.gravatar.com/avatar/602a16860e9a58e693b70e153b463e42.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0001-48.png","image_72":"https://secure.gravatar.com/avatar/602a16860e9a58e693b70e153b463e42.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0001-72.png","image_192":"https://secure.gravatar.com/avatar/602a16860e9a58e693b70e153b463e42.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0001.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":true,"is_ultra_restricted":true,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U0350DX5S","name":"jrosado","deleted":true,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-08/3168992169_b4d17899a5a04d56c975_original.jpg","first_name":"Jose","last_name":"Rosado","real_name":"Jose Rosado","real_name_normalized":"Jose Rosado","email":"jose@townsquaredigital.com"},"has_files":true,"presence":"away"},{"id":"U03F8GXRF","name":"juan","deleted":false,"status":null,"color":"8f4a2b","real_name":"Juan Sarria","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Juan","last_name":"Sarria","title":"","skype":"juanfermanny","phone":"","real_name":"Juan Sarria","real_name_normalized":"Juan Sarria","email":"juan@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/705a9e3fbcbc907bb1e4801af7c41657.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0009-24.png","image_32":"https://secure.gravatar.com/avatar/705a9e3fbcbc907bb1e4801af7c41657.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0009-32.png","image_48":"https://secure.gravatar.com/avatar/705a9e3fbcbc907bb1e4801af7c41657.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0009-48.png","image_72":"https://secure.gravatar.com/avatar/705a9e3fbcbc907bb1e4801af7c41657.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0009-72.png","image_192":"https://secure.gravatar.com/avatar/705a9e3fbcbc907bb1e4801af7c41657.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0009.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U03FKE27V","name":"jw","deleted":true,"profile":{"first_name":"Jason","last_name":"Williams","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-27/3532126892_6a28505009003e66798f_original.jpg","skype":"williamsjason.jw","phone":"3478828337","title":"Technical Producer, Digital Products","real_name":"Jason Williams","real_name_normalized":"Jason Williams","email":"jason@townsquaredigital.com"},"has_files":true,"presence":"away"},{"id":"U034YLRKH","name":"jzee","deleted":false,"status":null,"color":"2b6836","real_name":"Jonathan Zee","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Jonathan","last_name":"Zee","title":"","skype":"jonathan_zee","phone":"","real_name":"Jonathan Zee","real_name_normalized":"Jonathan Zee","email":"jz@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/02716e2a80f7a1a51b1b90ea073302e3.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-24.png","image_32":"https://secure.gravatar.com/avatar/02716e2a80f7a1a51b1b90ea073302e3.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-32.png","image_48":"https://secure.gravatar.com/avatar/02716e2a80f7a1a51b1b90ea073302e3.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0018-48.png","image_72":"https://secure.gravatar.com/avatar/02716e2a80f7a1a51b1b90ea073302e3.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-72.png","image_192":"https://secure.gravatar.com/avatar/02716e2a80f7a1a51b1b90ea073302e3.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03520E43","name":"marcelslottke","deleted":false,"status":null,"color":"db3150","real_name":"Marcel Slottke","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Marcel","last_name":"Slottke","title":"Art Director of Digital Products","skype":"marcel.slottke","phone":"","real_name":"Marcel Slottke","real_name_normalized":"Marcel Slottke","email":"marcel@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/7325b3945b62a745cb29f4409605143b.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-24.png","image_32":"https://secure.gravatar.com/avatar/7325b3945b62a745cb29f4409605143b.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-32.png","image_48":"https://secure.gravatar.com/avatar/7325b3945b62a745cb29f4409605143b.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0018-48.png","image_72":"https://secure.gravatar.com/avatar/7325b3945b62a745cb29f4409605143b.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-72.png","image_192":"https://secure.gravatar.com/avatar/7325b3945b62a745cb29f4409605143b.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U033Z4QPM","name":"masonhensley","deleted":false,"status":null,"color":"e0a729","real_name":"Mason Hensley","tz":"America/Chicago","tz_label":"Central Daylight Time","tz_offset":-18000,"profile":{"first_name":"Mason","last_name":"Hensley","title":"Seize the Deal Dev","skype":"masonhensley","phone":"","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-03/3135232141_29ddeaf21950f2afbc78_original.jpg","real_name":"Mason Hensley","real_name_normalized":"Mason Hensley","email":"masonhensley@seizethedeal.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U03FAK08J","name":"milesnaughton","deleted":false,"status":null,"color":"e06b56","real_name":"Miles Naughton","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Miles","last_name":"Naughton","title":"Creative Director","skype":"miles.naughton1","phone":"","real_name":"Miles Naughton","real_name_normalized":"Miles Naughton","email":"miles@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/a3d39cd7424ceed10289e989ae51700f.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-24.png","image_32":"https://secure.gravatar.com/avatar/a3d39cd7424ceed10289e989ae51700f.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-32.png","image_48":"https://secure.gravatar.com/avatar/a3d39cd7424ceed10289e989ae51700f.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F272a%2Fimg%2Favatars%2Fava_0018-48.png","image_72":"https://secure.gravatar.com/avatar/a3d39cd7424ceed10289e989ae51700f.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018-72.png","image_192":"https://secure.gravatar.com/avatar/a3d39cd7424ceed10289e989ae51700f.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0018.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U034YU29X","name":"ramiltaveras","deleted":true,"profile":{"first_name":"Ramil","last_name":"Taveras","real_name":"Ramil Taveras","real_name_normalized":"Ramil Taveras","email":"ramil@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/955f34547d08d13fc9df9fcd76418060.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0022-24.png","image_32":"https://secure.gravatar.com/avatar/955f34547d08d13fc9df9fcd76418060.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0022-32.png","image_48":"https://secure.gravatar.com/avatar/955f34547d08d13fc9df9fcd76418060.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0022-48.png","image_72":"https://secure.gravatar.com/avatar/955f34547d08d13fc9df9fcd76418060.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0022-72.png","image_192":"https://secure.gravatar.com/avatar/955f34547d08d13fc9df9fcd76418060.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0022.png"},"has_files":false,"presence":"away"},{"id":"U035NEGDL","name":"rishi","deleted":false,"status":null,"color":"53b759","real_name":"Rishi Sharma","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_72.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-10/3191013157_2e2abc61c801e973a280_original.jpg","first_name":"Rishi","last_name":"Sharma","title":"break $#!1","skype":"rishi.havoc","phone":"","real_name":"Rishi Sharma","real_name_normalized":"Rishi Sharma","email":"rishi@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U034Z189D","name":"ryanwillis","deleted":false,"status":null,"color":"d58247","real_name":"Ryan Willis","tz":"America/Los_Angeles","tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"first_name":"Ryan","last_name":"Willis","skype":"ryan.the.willis","phone":"916-390-5336","title":"Web Developer","real_name":"Ryan Willis","real_name_normalized":"Ryan Willis","email":"ryan@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/32aa7ece45a242991d1dd7a81c6c0671.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0010-24.png","image_32":"https://secure.gravatar.com/avatar/32aa7ece45a242991d1dd7a81c6c0671.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0010-32.png","image_48":"https://secure.gravatar.com/avatar/32aa7ece45a242991d1dd7a81c6c0671.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0010-48.png","image_72":"https://secure.gravatar.com/avatar/32aa7ece45a242991d1dd7a81c6c0671.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0010-72.png","image_192":"https://secure.gravatar.com/avatar/32aa7ece45a242991d1dd7a81c6c0671.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0010.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"away"},{"id":"U03F9CHK9","name":"sarahvankirk","deleted":false,"status":null,"color":"de5f24","real_name":"Sarah Vankirk","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Sarah","last_name":"Vankirk","real_name":"Sarah Vankirk","real_name_normalized":"Sarah Vankirk","email":"sarah.vankirk@townsquareinteractive.com","image_24":"https://secure.gravatar.com/avatar/7609612c551d13ad66dffe80f86f2802.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0000-24.png","image_32":"https://secure.gravatar.com/avatar/7609612c551d13ad66dffe80f86f2802.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0000-32.png","image_48":"https://secure.gravatar.com/avatar/7609612c551d13ad66dffe80f86f2802.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0000-48.png","image_72":"https://secure.gravatar.com/avatar/7609612c551d13ad66dffe80f86f2802.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0000-72.png","image_192":"https://secure.gravatar.com/avatar/7609612c551d13ad66dffe80f86f2802.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0000.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":true,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U0399J1QD","name":"sowmiya","deleted":false,"status":null,"color":"385a86","real_name":"Sowmiya Srinivasa","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Sowmiya","last_name":"Srinivasa","title":"","skype":"sowmiya.srinivasaraghavan","phone":"","real_name":"Sowmiya Srinivasa","real_name_normalized":"Sowmiya Srinivasa","email":"sowmiya@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/8804e17a289138c09343a2ef72226435.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0011-24.png","image_32":"https://secure.gravatar.com/avatar/8804e17a289138c09343a2ef72226435.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0011-32.png","image_48":"https://secure.gravatar.com/avatar/8804e17a289138c09343a2ef72226435.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0011-48.png","image_72":"https://secure.gravatar.com/avatar/8804e17a289138c09343a2ef72226435.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0011-72.png","image_192":"https://secure.gravatar.com/avatar/8804e17a289138c09343a2ef72226435.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0011.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":false,"presence":"active"},{"id":"U03AP3LNV","name":"stephen.alba","deleted":false,"status":null,"color":"50a0cf","real_name":"Stephen Alba","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Stephen","last_name":"Alba","title":"","skype":"stephen8alba","phone":"","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-28/3542087351_f974e37e23493fcccea9_original.jpg","real_name":"Stephen Alba","real_name_normalized":"Stephen Alba","email":"stephen.alba@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"active"},{"id":"U034K5X29","name":"stevefrost","deleted":false,"status":null,"color":"684b6c","real_name":"Steve Frost","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Steve","last_name":"Frost","skype":"ffrostt7","phone":"734 306 9492","title":"Operations & Support Manager","real_name":"Steve Frost","real_name_normalized":"Steve Frost","email":"steve@townsquaredigital.com","image_24":"https://secure.gravatar.com/avatar/c05aa413f18a0266ed1bc96a0be54fa5.jpg?s=2…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0008-24.png","image_32":"https://secure.gravatar.com/avatar/c05aa413f18a0266ed1bc96a0be54fa5.jpg?s=3…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0008-32.png","image_48":"https://secure.gravatar.com/avatar/c05aa413f18a0266ed1bc96a0be54fa5.jpg?s=4…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0008-48.png","image_72":"https://secure.gravatar.com/avatar/c05aa413f18a0266ed1bc96a0be54fa5.jpg?s=7…%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0008-72.png","image_192":"https://secure.gravatar.com/avatar/c05aa413f18a0266ed1bc96a0be54fa5.jpg?s=1…%3A%2F%2Fslack.global.ssl.fastly.net%2F3654%2Fimg%2Favatars%2Fava_0008.png"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U033GCPL5","name":"sun","deleted":false,"status":null,"color":"9f69e7","real_name":"Sun Sachs","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Sun","last_name":"Sachs","title":"SVP Product, Design & Engineering","skype":"sunsachs","phone":"9174397012","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-14/3415255110_a6d8badd604b0db45eca_original.jpg","real_name":"Sun Sachs","real_name_normalized":"Sun Sachs","email":"sun@townsquaredigital.com"},"is_admin":true,"is_owner":true,"is_primary_owner":true,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"presence":"away"},{"id":"U045TMWF7","name":"tsmbot","deleted":false,"status":null,"color":"4ec0d6","real_name":"","tz":null,"tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"bot_id":"B045TMWF3","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-25/4197744579_05a92f0655ab94e01132_original.jpg","real_name":"","real_name_normalized":""},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":true,"has_files":false,"presence":"away"},{"id":"U033Z49JK","name":"wolstat","deleted":false,"status":null,"color":"e96699","real_name":"Mike Wolstat","tz":"America/Indiana/Indianapolis","tz_label":"Eastern Daylight Time","tz_offset":-14400,"profile":{"first_name":"Mike","last_name":"Wolstat","image_24":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_24.jpg","image_32":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_32.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_72.jpg","image_192":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_192.jpg","image_original":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2014-12-05/3153094333_ac0e3e45322a7a563d6f_original.jpg","title":"","skype":"wolstat","phone":"","real_name":"Mike Wolstat","real_name_normalized":"Mike Wolstat","email":"mike@townsquaredigital.com"},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"has_files":true,"has_2fa":false,"presence":"active"},{"id":"USLACKBOT","name":"slackbot","deleted":false,"status":null,"color":"757575","real_name":"Slack Bot","tz":null,"tz_label":"Pacific Daylight Time","tz_offset":-25200,"profile":{"first_name":"Slack","last_name":"Bot","image_24":"https://slack-assets2.s3-us-west-2.amazonaws.com/10068/img/slackbot_24.png","image_32":"https://slack-assets2.s3-us-west-2.amazonaws.com/10068/img/slackbot_32.png","image_48":"https://slack-assets2.s3-us-west-2.amazonaws.com/10068/img/slackbot_48.png","image_72":"https://slack-assets2.s3-us-west-2.amazonaws.com/10068/img/slackbot_72.png","image_192":"https://slack-assets2.s3-us-west-2.amazonaws.com/10068/img/slackbot_192.png","real_name":"Slack Bot","real_name_normalized":"Slack Bot","email":null},"is_admin":false,"is_owner":false,"is_primary_owner":false,"is_restricted":false,"is_ultra_restricted":false,"is_bot":false,"presence":"active"}],
"bots":[{"id":"B03C79AFL","name":"asana","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/31009/plugins/asana/assets/bot_48.png"}},{"id":"B045TMWF3","name":"bot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/93ed/img/services/bots_48.png"}},{"id":"B046GMUE5","name":"bot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/93ed/img/services/bots_48.png"}},{"id":"B046EJGKZ","name":"Calendar","deleted":false,"icons":{"emoji":":date:","image_64":"https://slack-assets2.s3-us-west-2.amazonaws.com/5504/img/emoji/1f4c5.png"}},{"id":"B04169TRR","name":"crashlytics","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/010d/img/services/crashlytics_48.png"}},{"id":"B0416ART7","name":"crashlytics","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/010d/img/services/crashlytics_48.png"}},{"id":"B00","name":"dropbox","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/dropbox_48.png"}},{"id":"B033K5L9Q","name":"giphy","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/24853/plugins/giphy/assets/bot_48.png"}},{"id":"B04193GHW","name":"github","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}},{"id":"B046FKDG3","name":"github","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}},{"id":"B048KK80L","name":"github","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}},{"id":"B033Z76CD","name":"google-hangouts","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/11591/img/services/hangouts_48.png"}},{"id":"B0340AQ2N","name":"ifttt","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/ifttt_48.png"}},{"id":"B03DQSR2G","name":"ifttt","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/ifttt_48.png"}},{"id":"B04675AGZ","name":"ifttt","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/7bf4/img/services/ifttt_48.png"}},{"id":"B046E922K","name":"ifttt","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/7bf4/img/services/ifttt_48.png"}},{"id":"B03BEJ2CW","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/incoming-webhook_48.png"}},{"id":"B0422USNU","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B044B5V8F","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B044F0NS9","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B045ZKF0W","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046EEUUV","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046L92B0","name":"incoming-webhook","deleted":false,"icons":{"image_36":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-30/4250826477_1ad1e8d61b32c7498025_36.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-30/4250826477_1ad1e8d61b32c7498025_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-03-30/4250826477_1ad1e8d61b32c7498025_48.jpg"}},{"id":"B046NMJBZ","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046P8D25","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046QP0S3","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B048LS8EE","name":"incoming-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B03B1K396","name":"nagiobot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/nagios_48.png"}},{"id":"B03BEG056","name":"Nagios","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/nagios_48.png"}},{"id":"B0416AR45","name":"New Relic","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/7bf4/img/services/new-relic_48.png"}},{"id":"B03E2S1A3","name":"outgoing-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/outgoing-webhook_48.png"}},{"id":"B03EBLA69","name":"outgoing-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/outgoing-webhook_48.png"}},{"id":"B03J9HZKA","name":"outgoing-webhook","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/outgoing-webhook_48.png"}},{"id":"B03E50HBC","name":"produx","deleted":false,"icons":{"image_36":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-21/3481172758_843d602646b68e883be4_36.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-21/3481172758_843d602646b68e883be4_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-21/3481172758_843d602646b68e883be4_72.jpg"}},{"id":"B03EAPT74","name":"produx®","deleted":false,"icons":{"image_36":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-22/3486849930_ce852205dc35a13020d8_36.jpg","image_48":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-22/3486849930_ce852205dc35a13020d8_48.jpg","image_72":"https://s3-us-west-2.amazonaws.com/slack-files2/avatars/2015-01-22/3486849930_ce852205dc35a13020d8_72.jpg"}},{"id":"B042XN087","name":"qa-automatron","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B03CTLZA9","name":"rss","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/rss_48.png"}},{"id":"B03G2KJJP","name":"screenhero","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/screenhero_48.png"}},{"id":"B046EK59F","name":"Sentry","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/43a8/img/services/sentry_48.png"}},{"id":"B03FDA45A","name":"slackbot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20492/plugins/slackbot/assets/bot_48.png"}},{"id":"B044HCG3U","name":"slackbot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4c66/plugins/slackbot/assets/bot_48.png"}},{"id":"B044HCG6E","name":"slackbot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4c66/plugins/slackbot/assets/bot_48.png"}},{"id":"B047EQQRB","name":"slackbot","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4c66/plugins/slackbot/assets/bot_48.png"}},{"id":"B03EC0JEB","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/23267/plugins/slash_commands/assets/bot_48.png"}},{"id":"B03EE5E32","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/23267/plugins/slash_commands/assets/bot_48.png"}},{"id":"B03EEMYUA","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/23267/plugins/slash_commands/assets/bot_48.png"}},{"id":"B03P12MFU","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/23267/plugins/slash_commands/assets/bot_48.png"}},{"id":"B045LGSS7","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B045LHEFU","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B045RMCUU","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B045Y0ED4","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B0460AMD4","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B0460JJ3C","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B046JU387","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B047E4RCD","name":"slash-commands","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/slash-commands_48.png"}},{"id":"B0341EA9W","name":"zapier","deleted":false,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/zapier_48.png"}},{"id":"B033ZTRR1","name":"rss","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/rss_48.png"}},{"id":"B033ZJWDV","name":"github","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/20653/img/services/github_48.png"}},{"id":"B03B1E9CY","name":"Nagiobot","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/nagios_48.png"}},{"id":"B03C503B9","name":"incoming-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/incoming-webhook_48.png"}},{"id":"B03JGCSM8","name":"incoming-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/12078/img/services/incoming-webhook_48.png"}},{"id":"B03NYHUQV","name":"slash-commands","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/23267/plugins/slash_commands/assets/bot_48.png"}},{"id":"B044SLN8W","name":"outgoing-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B045E29FY","name":"incoming-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046FEAHK","name":"github","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}},{"id":"B046FHSS5","name":"github","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}},{"id":"B045ZRA6A","name":"incoming-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B046THQQ0","name":"incoming-webhook","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/4324/img/services/incoming-webhook_48.png"}},{"id":"B0416CA95","name":"github","deleted":true,"icons":{"image_48":"https://slack.global.ssl.fastly.net/5721/plugins/github/assets/bot_48.png"}}],
"cache_version":"v6-dog",
"url":"wss://ms144.slack-msgs.com/websocket/hR68uAgnyXZ3NEKPGvaZF4gL/41oFBLUfaUVwDwyUf1xYCbCnUybjntVhJ3_QcpIPCkr5KXMV6M1FShaQHSwDvHm0uBjoGQ3srbYKrLlfZE="};

_tsmSlackChromeExt.authorize();

chrome.idle.onStateChanged.addListener( function (state) { _tsmSlackChromeExt.onChromeStateChange(state); });
