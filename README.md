# Simple Dark Mode for WP Dashboard

Dark mode for wp-admin, for all users. To use, just install and activate. There are no settings.

## How this is different from other dark mode plugins

- Fully open source, no ads or pro versions
- Only for wp-admin: the site's front end and the editor canvas belong to your theme
- The admin colour scheme stays yours
- Covers the block editor and the site editor

## Supported plugins

- Yoast SEO
- ActivityPub
- Dude AI
- Advanced Custom Fields
- Koko Analytics
- Simple History

## Development

`assets/css/` is built, don't edit it. `bin/build.mjs` reads WordPress' stylesheets and repeats every colour declaration with its dark counterpart under the same selector. `src/` holds what the build can't know.

```sh
npm install
YOAST_VERSION=2850 node bin/build.mjs /path/to/wordpress /path/to/plugins
```

Run it for each new WordPress release.
