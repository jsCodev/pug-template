const { src, dest, parallel, series, task, watch, lastRun } = require('gulp');

//utils
const sourcemaps = require('gulp-sourcemaps');
const concat = require('gulp-concat');
const gulpIf = require('gulp-if');
const through = require('through2');
const emitty = require('@emitty/core').configure();
const plumber = require('gulp-plumber');
const size = require('gulp-size');
const remember = require('gulp-remember');
const merge = require('merge-stream');

//scss
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const inlineSvg = require('postcss-inline-svg'); // https://www.npmjs.com/package/postcss-inline-svg
const sortMediaQueries = require('postcss-sort-media-queries');
const scss = require('gulp-dart-sass');
const csso = require('gulp-csso');
const bulkSass = require('gulp-sass-bulk-import');

//html
const htmlbeautify = require('gulp-html-beautify');
const pug = require('gulp-pug-3');

// js
const terser = require('gulp-terser');
const TerserPlugin = require('terser-webpack-plugin');
const babel = require('gulp-babel');


//svg
const svgSprite = require('gulp-svg-sprite');
const cheerio = require('gulp-cheerio');
const replace = require('gulp-replace');

// server
const browserSync = require('browser-sync').create();

const buildConfig = require('./config')

emitty.language({
	extensions: ['.pug'],
	parser: require('@emitty/language-pug').parse
});

const emittyConfig = {
	isWatchMode: false,
	// Changed files are written by the name of the task that will process them.
	// This is necessary to support more than one language in @emitty.
	watch: {
		templates: undefined,
	}
}

const removeEmptyLines = () => {
	return through.obj(function(file, _encoding, callback) {
		let fileContent = file.contents.toString();
	  if (!fileContent === null || !fileContent === '' || fileContent) {
	    try {
	    	fileContent = fileContent.replace(/[\r\n]/gm, '') // remove 2 and more spaces in a row
	    	fileContent = fileContent.replace(/[\s]{2,}/gm, '') // remove empty lines and line breaks
				file.contents = Buffer.from(fileContent);
	    } catch (err) {
	      this.emit('error', new Error(`Something went wrong during removing empty lines! Error:\n${err.message}`));
	    }
	  }
		this.push(file);
		callback();
	})
}

const server = () => {
	browserSync
    .init({
      server: {
        baseDir: buildConfig.paths.build_directory,
        directory: true,
      },
      port: 3333,
      open: buildConfig.shouldOpenBrowser,
      reloadOnRestart: true,
      notify: false,
    });
}

const getFilter = taskName => {
	return through.obj(function(file, _encoding, callback) {
		emitty.filter(file.path, emittyConfig.watch[taskName]).then((result) => {
			if (result) {
				this.push(file);
			}
			callback();
		});
	});
}
const templates = () => {
	const htmlBeautifyOptions = {
		// "extra_liners": ['svg'],
		// "unformatted": ['span'],
		'inline': ['br', 'b', 'strong', 'span'],
		'indent_size': 2,
		'indent_char': '\t',
		'indent_with_tabs': true,
		'editorconfig': false,
		'eol': '\n',
		'end_with_newline': true,
		'indent_level': 0,
		'preserve_newlines': false,
		'max_preserve_newlines': 10000
	};

	return src(buildConfig.paths.pug.src)
		.pipe(plumber({
			errorHandler: function(err) {
				console.log('templates ', err.message);
				this.emit('end');
			}
		}))
		.pipe(gulpIf(emittyConfig.isWatchMode, getFilter('templates'))) // Enables filtering only in watch mode
		.pipe(pug())
		.pipe(htmlbeautify(htmlBeautifyOptions))
		.pipe(gulpIf(buildConfig.__PROD__, size({ showFiles: true, title: 'HTML' })))
		.pipe(dest(buildConfig.paths.build_directory))
		.pipe(gulpIf(buildConfig.serverEnabled, browserSync.stream()));
}

const styles = () => {
	return src(buildConfig.paths.scss.src)
		.pipe(plumber({
			errorHandler: function(err) {
				console.log('styles ', err.message);
				this.end();
			}
		}))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.init()))
		.pipe(bulkSass())
		.pipe(scss().on('error', scss.logError))
		.pipe(postcss([
			autoprefixer(),
			inlineSvg({ removeFill: true, removeStroke: true }),
			sortMediaQueries({
				sort: 'desktop-first'
			})
		]))
		.pipe(gulpIf(buildConfig.__PROD__, csso({ restructure: true })))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.write(buildConfig.paths.sourcemaps)))
		.pipe(gulpIf(buildConfig.__PROD__, size({ showFiles: true, title: 'CSS' })))
		.pipe(dest(buildConfig.paths.scss.build))
		.pipe(gulpIf(buildConfig.serverEnabled, browserSync.stream()));
}

const scriptsBundle = () => {
	return src([
    `${buildConfig.paths.js.src}/vendor/jquery.min.js`,
    `${buildConfig.paths.js.src}/lib.js`,
    `${buildConfig.paths.js.src}/bundle.js`,
		])
		.pipe(plumber({
			errorHandler: function(err) {
				console.log('scripts ', err.message);
				this.end();
			}
		}))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.init()))
		.pipe(gulpIf(buildConfig.__PROD__, babel(buildConfig.babelOptions)))
		.pipe(gulpIf(buildConfig.__PROD__, terser(buildConfig.terserOptions)))
		.pipe(concat('bundle.js'))
		.pipe(gulpIf(buildConfig.__PROD__, removeEmptyLines()))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.write(buildConfig.paths.sourcemaps)))
		.pipe(gulpIf(buildConfig.__PROD__, size({ showFiles: true, title: 'JS' })))
		.pipe(dest(buildConfig.paths.js.build))
		.pipe(gulpIf(buildConfig.serverEnabled, browserSync.stream()));
}

const scriptsPages = () => {
	return src(buildConfig.paths.jsPages.src)
		.pipe(plumber({
			errorHandler: function(err) {
				console.log('scriptsPages ', err.message);
				this.end();
			}
		}))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.init()))
		.pipe(gulpIf(buildConfig.__PROD__, babel(buildConfig.babelOptions)))
		.pipe(gulpIf(buildConfig.__PROD__, terser(buildConfig.terserOptions)))
		.pipe(gulpIf(buildConfig.__PROD__, removeEmptyLines()))
		.pipe(gulpIf(buildConfig.__DEV__, sourcemaps.write(buildConfig.paths.sourcemaps)))
		.pipe(gulpIf(buildConfig.__PROD__, size({ showFiles: true, title: 'JS pages' })))
		.pipe(dest(buildConfig.paths.js.build))
		.pipe(gulpIf(buildConfig.serverEnabled, browserSync.stream()));
}

const copyImages = () => {
	return src([
			`${buildConfig.paths.img.src}/**/*`,
			`!${buildConfig.paths.img.src}/svg/sprite`,
			`!${buildConfig.paths.img.src}/svg/sprite/*`
		], { base: buildConfig.paths.source_directory, since: lastRun(copyImages) })
		.pipe(remember('copyImages'))
		.pipe(dest(buildConfig.paths.build_directory))
}

const copyFiles = () => {
	const js = src(`${buildConfig.paths.js.src}/vendor/lazysizes.min.js`)
		.pipe(gulpIf(buildConfig.__PROD__, terser({
			warnings: false,
			compress: {
				comparisons: false,
			},
			parse: {},
			mangle: true,
			output: {
				comments: false,
				ascii_only: true,
			},
			sourceMap: false,
		})))
		.pipe(dest(buildConfig.paths.js.build));

	const favicons = src(`${buildConfig.paths.source_directory}/favicons/*`)
		.pipe(dest(`${buildConfig.paths.build_directory}/favicons`));

	return merge(js, favicons);
};

const createSvgSprite = () => {
	return src(`${buildConfig.paths.img.src}/svg/sprite/*.svg`)
		.pipe(plumber({
			errorHandler: function(err) {
				console.log(err.message);
				this.end();
			}
		}))
		// remove all fill, style and stroke declarations in out shapes
		.pipe(cheerio({
			run: function($) {
				$('[fill]').removeAttr('fill');
				$('[stroke]').removeAttr('stroke');
				$('[style]').removeAttr('style');
			},
			parserOptions: { xmlMode: true }
		}))
		// cheerio plugin create unnecessary string '&gt;', so replace it.
		.pipe(replace('&gt;', '>'))
		.pipe(svgSprite({
			mode: {
				symbol: {
					prefix: '.svg-icon-%s',
					dimensions: '%s',
					sprite: '../sprite.svg',
					render: {
						scss: {
							dest: '../../../scss/components/_sprite.scss',
						}
					}
				}
			},
		}))
		.pipe(dest(`${buildConfig.paths.img.src}/svg`))
}

const watchTask = () => {
  watch(buildConfig.paths.pug.watch, templates).on("all", (event, changed) => {
    // write the changed file name to emmity config object
    emittyConfig.watch.templates = changed;
  });

  watch(buildConfig.paths.scss.watch, styles);
  watch(buildConfig.paths.img.watch, copyImages);

  if (buildConfig.useGulpForJs) {
    watch(buildConfig.paths.js.watch, scriptsBundle);
    watch(buildConfig.paths.jsPages.watch, scriptsPages);
  } else {
    watch(buildConfig.paths.js.watch).on("change", () =>
      setTimeout(browserSync.reload, 300)
    ); // reload while webpack bundling js
  }
};

// need for templates task
const watchInit = (done) => {
  // Enables the watch mode for conditions
  emittyConfig.isWatchMode = true;
  done();
};

const defaultTask = buildConfig.serverEnabled
  ? parallel(series(watchInit, templates, watchTask), server)
  : series(watchInit, templates, watchTask);

const build = buildConfig.useGulpForJs
  ? parallel(templates, styles, copyImages, copyFiles, scriptsBundle)
  : parallel(templates, styles, copyImages, copyFiles);

task("default", defaultTask);
task("server", server);
task("sprite", series(createSvgSprite, copyImages));
task("css", styles);
task("copy:img", copyImages);
task("copy:files", copyFiles);
task("templates", templates);
task("build", build);

if (buildConfig.useGulpForJs) {
  // task("js:pages", scriptsPages);
  task("js", scriptsBundle);
}
