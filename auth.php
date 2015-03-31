<?php
/**
 * Slack strategy for Opauth
 *
 * Based on work by U-Zyn Chua (http://uzyn.com)
 *
 * More information on Opauth: http://opauth.org
 *
 * @copyright    Copyright © 2015 Timm Stokke (http://timm.stokke.me)
 * @link         http://opauth.org
 * @package      Opauth.BasecampStrategy
 * @license      MIT License
 */


/**
 * Slack strategy for Opauth
 *
 * @package			Opauth.Slack
 */
class SlackStrategy extends OpauthStrategy {

	/**
	 * Compulsory config keys, listed as unassociative arrays
	 */
	public $expects = array('client_id', 'client_secret');

	/**
	 * Optional config keys, without predefining any default values.
	 */
	public $optionals = array('redirect_uri', 'scope', 'state');

	/**
	 * Optional config keys with respective default values, listed as associative arrays
	 * eg. array('scope' => 'post');
	 */
	public $defaults = array(
		'redirect_uri' => '{complete_url_to_strategy}oauth2callback'
	);

	/**
	 * Auth request
	 */
	public function request() {
		$url = 'https://slack.com/oauth/authorize';
		$params = array(
			'client_id' => $this->strategy['client_id'],
			'redirect_uri' => $this->strategy['redirect_uri']
		);

		foreach ($this->optionals as $key) {
			if (!empty($this->strategy[$key])) $params[$key] = $this->strategy[$key];
		}

		$this->clientGet($url, $params);
	}

	/**
	 * Internal callback, after OAuth
	 */
	public function oauth2callback() {
		if (array_key_exists('code', $_GET) && !empty($_GET['code'])) {
			$code = $_GET['code'];
			$url = 'https://slack.com/api/oauth.access';

			$params = array(
				'code' => $code,
				'client_id' => $this->strategy['client_id'],
				'client_secret' => $this->strategy['client_secret'],
				'redirect_uri' => $this->strategy['redirect_uri'],
			);

			if (!empty($this->strategy['state'])) $params['state'] = $this->strategy['state'];

			$response = $this->serverPost($url, $params, null, $headers);
			$results = json_decode($response,true);

			if (!empty($results) && !empty($results['access_token'])) {

				$user = $this->user($results['access_token']);


				$this->auth = array(
					'uid' => $user['basics']['user_id'],
					'info' => array(),
					'credentials' => array(
						'token' => $results['access_token']
					),
					'raw' => $user
				);

				$this->mapProfile($user, 'user.real_name', 'info.name');
				$this->mapProfile($user, 'user.name', 'info.nickname');
				$this->mapProfile($user, 'user.profile.first_name', 'info.first_name');
				$this->mapProfile($user, 'user.profile.last_name', 'info.last_name');
				$this->mapProfile($user, 'user.profile.email', 'info.email');
				$this->mapProfile($user, 'user.profile.image_48', 'info.image');

				$this->callback();
			}
			else {
				$error = array(
					'code' => 'access_token_error',
					'message' => 'Failed when attempting to obtain access token',
					'raw' => array(
						'response' => $response,
						'headers' => $headers
					)
				);

				$this->errorCallback($error);
			}
		}
		else {
			$error = array(
				'code' => 'oauth2callback_error',
				'raw' => $_GET
			);

			$this->errorCallback($error);
		}
	}

	/**
	 * Queries Slack API for user info
	 *
	 * @param string $access_token
	 * @return array Parsed JSON results
	 */
	private function user($access_token) {
		$user = $this->serverGet('https://slack.com/api/auth.test', array('token' => $access_token), null, $headers);

		if (!empty($user)) {
			$basics = $this->recursiveGetObjectVars(json_decode($user));

			// Get detailed info:
			$getDetails = $this->serverGet('https://slack.com/api/users.info', array('token' => $access_token, 'user' => $basics['user_id']), null, $headers);
			$details = $this->recursiveGetObjectVars(json_decode($getDetails));

			$details['basics'] = $basics;

			return $details;
		}
		else {
			$error = array(
				'code' => 'userinfo_error',
				'message' => 'Failed when attempting to query Slack API for user information',
				'raw' => array(
					'response' => $user,
					'headers' => $headers
				)
			);

			$this->errorCallback($error);
		}
	}
}
