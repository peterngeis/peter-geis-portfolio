# [Portfolio](https://www.petergeis.com)

A static site with HTML, CSS, JS, and an `images/` folder.

## How the project is organized

The page is a stack of sections. Each section has one stylesheet
and, in most cases, one script, and the files share the section's name.

| Page section | Stylesheet | Script |
| --- | --- | --- |
| (shared: colors, buttons, top bar) | `css/base.css` | |
| Landing: loader, name, radar, cursor reveal | `css/hero.css` | `js/hero.js` |
| Introduction | `css/statement.css` | `js/statement.js` |
| Scroll pauses (hold a frame still on screen) | `css/scroll-pause.css` | `js/scroll-pause.js` |
| Field photos | `css/field-photos.css` | `js/field-photos.js` |
| On the clock / Off the clock panels | `css/split.css` | |
| Experience timeline | `css/experience.css` | `js/experience.js` |
| Class demo (painter) | `css/class-demo.css` | `js/painter.js` |
| Senior design | `css/senior-design.css` | `js/video.js` plays the drop test clip |
| My current build (zooming photo, part points) | `css/build-photo.css` | `js/build-photo.js` |
| Build cards and drawer | `css/builds.css` | `js/drawer.js` |
| Toolkit ticker | `css/toolkit.css` | `js/toolkit.js` |
| Contact and footer | `css/contact.css` | |
| Phone and tablet layouts, reduced motion | `css/responsive.css` (keep last) | |
| Top bar background on phones | | `js/nav.js` |
| Shared helpers and the one animation loop | | `js/core.js` |

Other files:

```
index.html            all the page content, with a labeled comment above each section
images/               photos (WebP), and additional media
favicon.svg           
favicon.ico           
apple-touch-icon.png  
robots.txt            avoiding scraping, google page rank. 
```