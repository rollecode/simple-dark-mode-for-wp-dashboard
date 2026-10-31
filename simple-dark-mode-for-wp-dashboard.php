<?php
/**
 * Plugin Name: Simple Dark Mode for WP Dashboard
 * Plugin URI: https://github.com/rollecode/simple-dark-mode-for-wp-dashboard
 * Description: The simplest way to make your WordPress dashboard dark. No settings: activate and enjoy the darkness.
 * Version: 2.0.0rc2
 * Requires at least: 7.0
 * Requires PHP: 8.0
 * Author: Roni Laukkarinen
 * Author URI: https://github.com/rollecode
 * License: GPL-3.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain: simple-dark-mode-for-wp-dashboard
 *
 * @package simple-dark-mode-for-wp-dashboard
 */

defined( 'ABSPATH' ) || exit;

const SIMPLE_DARK_MODE_VERSION = '2.0.0rc2';

/**
 * Add the dark styles after everything else, so they win on equal selectors.
 */
function simple_dark_mode_enqueue() {
  wp_enqueue_style(
    'simple-dark-mode',
    plugins_url( 'assets/css/dark-mode.css', __FILE__ ),
    [],
    SIMPLE_DARK_MODE_VERSION
  );

  $plugins = [
    'activitypub'   => defined( 'ACTIVITYPUB_PLUGIN_VERSION' ),
    'wordpress-seo' => defined( 'WPSEO_VERSION' ),
  ];

  foreach ( array_keys( array_filter( $plugins ) ) as $plugin ) {
    wp_enqueue_style(
      'simple-dark-mode-' . $plugin,
      plugins_url( 'assets/css/' . $plugin . '.css', __FILE__ ),
      [ 'simple-dark-mode' ],
      SIMPLE_DARK_MODE_VERSION
    );
  }
}
add_action( 'admin_enqueue_scripts', 'simple_dark_mode_enqueue', PHP_INT_MAX );
add_action( 'customize_controls_enqueue_scripts', 'simple_dark_mode_enqueue', PHP_INT_MAX );

/**
 * Tell the browser early, so scrollbars and form controls are dark too.
 */
function simple_dark_mode_color_scheme() {
  echo '<meta name="color-scheme" content="dark">' . "\n";
}
add_action( 'admin_head', 'simple_dark_mode_color_scheme' );
