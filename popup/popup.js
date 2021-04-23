// https://gitlab.com/losnappas/Context-menu-Wiktionary

/* --- TODO --- 
- Add a search function
- Find a way to properly integrate proper nouns, whether or not they have definitions in lowercase.
- Add a footer and stuff
- Add a loading screen
- Fill no definition popup with content, and find workaround for 400px min-height rule
*/

'use strict';

// CONSTANT AND VARIABLE DECLARATIONS

// searchText string modification 
const normalize = (word) => word.trim().replace(/ /g, '_');		// This converts a string into a Wiktionary API URL. Don't conflate this with "humanize".
const humanize = (word) => word.trim().replace(/_/g, ' ');		// This converts a Wiktionary API URL to format better suited for reading.

// Wiktionary search strings
const WIKTIONARYURL = (word) => `https://en.wiktionary.org/api/rest_v1/page/definition/${word}`;
const EDITURL = (word) => `https://en.wiktionary.org/w/index.php?title=${word}&action=edit`;
const WORDURL = (word) => `https://en.wiktionary.org/wiki/${word}`;		// This becomes the link called by the externalLink element.
const SEARCHURL = (word) =>
	`https://en.wiktionary.org/w/api.php?action=opensearch&search=${word}&profile=engine_autoselect`; // This is used to find alternative searchText spellings

const SCROLLDOWNWAIT = 10; // Opening the slider autoscrolls. -- In ms: the timeout before scrolling lower again.

// User-agent information
const HOMEPAGE = `https://gitlab.com/losnappas/Context-menu-Wiktionary`;
const MYEMAIL = `hanu6@hotmail.com`;


const ALLOWED_TAGS = '<b><i><u><strong><a><span><div><small>'; // Used to whitelist certain tags we want in our definitions.

var translations;

// Stand-in to remove ambiguity from selectionText.
var searchText;

// Used when building the pop-up HTML
var searchPlaceholder;
var extLinkTitle;
var extLinkHref;

// Send message back indicating that the popup is now open & ready.
window.onload = () => {
	browser.runtime.sendMessage({ ok: true });
};

browser.runtime.onMessage.addListener((selectionText) => { // Background.js responds with the selection text.
	searchText = selectionText || '';

/*
	Instead of normalising, perhaps integrate checks for proper nouns?
	i.e. search for original string (if not all caps)
	if there isn't any definition in any language, search for normalised string
	if there is a definition for non-english language, then add a button to search for the normalised string
*/
	switch (true) {
		case (searchText === ''):
			noDefinition();
			break;
		case (searchText.toUpperCase() !== searchText):  // Don't normalise selections that are written in allcaps (for acronyms).
			searchText = searchText.toLowerCase(); // This code normalises the searchText for translation.
			translate(normalize(searchText));
			break;
		default:
			translate(normalize(searchText));
	}
});

function noDefinition() { // This script runs when searchText is blank.
			searchPlaceholder = `Wiktionary`;
			extLinkTitle = `Open Wiktionary.org in a new tab`;
			extLinkHref = `https://en.wiktionary.org/`;
			
			defPageTemplate(searchPlaceholder, extLinkTitle, extLinkHref);
			defPageFooterTemplate()
}

function translate(searchText) {
	/*
		Fetches Wiki dictionary (Wiktionary) meaning for selected word.
		Wiktionary gives <b> and <i> etc tags too.
	*/
	fetch(WIKTIONARYURL(searchText), {
		method: 'GET',
		headers: new Headers({
			'Api-User-Agent': `Context_Menu_Dictionary_Firefox_extension/1.0; (${HOMEPAGE}; ${MYEMAIL})`,
			redirect: true,
		}),
	})
		.then((res) => {
			if (res.ok) {
				return res.json();
			} else {
				throw new Error('' + res.status + ': ' + res.statusText);
			}
		})
		.then((res) => {
			//store result in upper scope
			translations = res;
			if (!translations.en) {
				// old way: // throw new Error("No English meaning found. Try the <b><i>"+ BUTTONTEXT +"</i></b> button below.")
				// see: last .then of this chain.
				translations.en = [
					{
						partOfSpeech: 'No English meaning found.',
					},
				];
			}
		})
		.catch(async (e) => {
			if (translations == null) {
				translations = {};
			}

			// Different spellings.
			let alternate404Spellings = {};
			if (e.message.indexOf('404') !== -1) {
				const searchResults = await fetch(SEARCHURL(searchText))
					.then((res) => (res.ok && res.json()) || {})
					.catch(() => ({}));
				const found = searchResults[1] || [];
				alternate404Spellings = {
					definition: 'Similar and related words',
					examples: found.map(
						(word) =>
							`<a href="javascript:;" title="${normalize(word)}">${humanize(
								word
							)}</a>`
					),
				};
			}

			translations.en = [
				{
					partOfSpeech: e.name,
					definitions: [
						{
							definition: e.message,
						},
						{
							definition: `The word <b>${humanize(
								searchText
							)}</b> was not found.`,
							examples: [
								'<i>Know what it means?</i>',
								`<a title="${humanize(
									searchText
								)}" class="link-actual" target="_blank" id="addWord">Submit it to the Wiktionary.</a> <small>(Opens in a new tab.)</small>`,
							],
						},
						alternate404Spellings,
					],
				},
			];
		})
		.then(() => { // DEFINITION FOUND
			
			// Search Button
			searchPlaceholder = `${humanize(searchText).toTitleCase()}`;
			
			// External Link Button
			extLinkTitle = `Open '${humanize(searchText)}' in a new tab`;
			extLinkHref = WORDURL(searchText);
			
			defPageTemplate(searchPlaceholder, extLinkTitle, extLinkHref);

			// English translations:
			// translation is an array like [{partofspeect{},definitions:[definition:{},definition:{}]}]
			for (const translation of translations.en) {
				add(translation, document.body);
			}

			// Check that there is something to put under the expander.
			// aka. Check that there are other translations.
			if (Object.keys(translations).length > 1) {
				document.body.appendChild(createSlider());
			}
			defPageFooterTemplate()
		})
		
		.then(() => {
			populateSlider();
			// Add onclick handlers for language headings.
			csrunner();
			const hash = window.location.hash.slice(1);
			const e = document.getElementById(hash);
			if ( hash && e ) {
				// Anchor is in use.
				expand();
				e.classList.add('auto-scrolled')
				setTimeout(() => {
				e.scrollIntoView({
					behavior: 'smooth'
				})}, 300)
			} else if (translations.en[0].definitions == null) {
				// Finally, open the "other languages" box if English had no definitions.
				// This case only happens if English had no translations thus "translations.en" was touched on in the third ".then" clause.
				expand();
			}

		})
		.catch((e) =>
			console.error(`error in fetch chain wiktionary: ${e}, ${e.lineNumber}`)
		);
}

function defPageTemplate() { // "definition" Page Template
/*
	elements universal to all pages on the popup should be:
		- search bar (maybe not in a help or settings page)
		- external link to wiktionary.org
		- the footer (maybe we can call this in another function)
*/

			// Popup Header Template
			// This area contains the definition title, search bar, and external site link.
			const header = document.createElement('header');
			header.innerHTML += `
			<form id="search">
				<input id="searchInput" type="search" name="search" title="Search Wiktionary.org">
			</form>
			<a id="externalLink" class="default-color-button default-button" rel="noopener noreferrer" target="_blank"></a>`;
			
			// ---- Search Button
			const search = header.querySelector('#search');
			const searchInput = header.querySelector('#searchInput');
			searchInput.placeholder = `${searchPlaceholder}`;
			search.addEventListener('submit', (e) => {
				e.preventDefault();
				console.log('submit', e);
				define(e.target['0'].value);
			});
			// ---- External Link Button
			const link = header.querySelector('#externalLink');
			link.title = `${extLinkTitle}`;
			link.href = `${extLinkHref}`;
			link.addEventListener('click', (e) => open_page(e, searchText));
			
			document.body.appendChild(header);

}

function defPageFooterTemplate() { //Merge this with defPageTemplate later
			// Footer Template
			// This area contains the text license.
			const footer = document.createElement('footer');
			footer.innerHTML += `
			<small><i>Wiktionary defintions are available under the <a rel="noopener noreferrer" target="_blank" href="https://creativecommons.org/licenses/by-sa/3.0/">Creative Commons Attribution-ShareAlike License</a>; additional terms may apply.</i></small>`;
			
			document.body.appendChild(footer);
}

// Search wiktionary and display result on popup. The same thing as using the context menu.
// Except now we empty the popup first.
function define(word) {
	document.body.innerHTML = '';
	searchText = `${word}`;
	console.log('defining', searchText);
	translate(searchText);
}

// just another function to make a link.. This time for the header.
// Could change the other (EDITURL) to use this function too.
function open_page(e, word) {
	e.preventDefault();
	browser.tabs.create({
		url: WORDURL(word),
	});
}

// Add a button that opens up the rest of the translations
function createSlider() {
	const plusButton = document.createElement('button');
	const wrapper = document.createElement('div');
	const slider = document.createElement('div');

	slider.id = 'slider';
	slider.className = 'slider';
	slider.classList.toggle('closed');
	wrapper.className = 'slider-wrapper closed';
	plusButton.className = 'primary-color-button default-button';
	plusButton.id = 'languages-button';

	const plus = document.createTextNode('Other languages');
	plusButton.appendChild(plus);

	plusButton.onclick = expand;

	wrapper.appendChild(plusButton);

	
	wrapper.appendChild(slider);


	return wrapper;
}

function populateSlider() {
	const slider = document.getElementById('slider');
	if (slider && !slider.firstChild) {
		// Loop through different languages.
		// alternative was for..in, I guess? for..of even?
		Object.keys(translations).forEach((language) => {
			// English translation already exists.
			if (language !== 'en') {
				// Using this to make language header not appear a thousand times.
				let prevLang;
				for (const translation of translations[language]) {
					add(translation, slider, translation.language !== prevLang);
					prevLang = translation.language;
				}
			}
		}); //for
	} //if
}

// Expander for the button
function expand() {
	const slider = document.getElementById('slider');

	if (slider && !slider.classList.toggle('closed')) {
		// Scroll down with the expanding div
		scrollDown(0, 0);
	}
}

// TODO: improve this.. looks terrible sometimes.... but ehh---
// Compare current height to next height. If they don't match, then re-scroll to bottom and go again. If they do, goto step 1 10 times to make this thing less glitchy.
function scrollDown(cur, tries) {
	// Scrolls down with the expanding div.
	if (cur != document.body.scrollHeight) {
		window.scrollTo(0, document.body.scrollHeight);
		// Now this is lexical
		const x = document.body.scrollHeight;
		setTimeout(() => scrollDown(x, 0), SCROLLDOWNWAIT);
	} else if (tries < 10) {
		setTimeout(() => scrollDown(cur, tries + 1), SCROLLDOWNWAIT);
	}
}

// popup means context
function add(translation, popup, addingExtra) {
	const definitions = translation.definitions;

	const partOfSpeech = translation.partOfSpeech;

	if (addingExtra) {
		const language = translation.language;
		if (language) {
			// Put a heading to indicate the language we're using now.
			const h5 = document.createElement('h4');
			h5.id = '' + language.replace(/ /g, '_');
			const slider = document.getElementById('slider');
			const lang = document.createTextNode(language);
			h5.appendChild(lang);
			slider.appendChild(h5);
		}
	}

	// noun/verb/etc
	if (partOfSpeech) {
		const p = document.createElement('h3');
		const t = document.createTextNode(partOfSpeech);
		p.appendChild(t);
		popup.appendChild(p);
	}

	if (definitions) {
		//definitions
		const ol = document.createElement('ol');
		for (const definition of definitions) {
			const li = document.createElement('li');

			let frag = createFragment(definition.definition);
			li.appendChild(frag.content);

			if (definition.examples) {
				const ul = document.createElement('ul');

				//definition used in a sentence
				for (const example of definition.examples) {
					const li = document.createElement('li');
					frag = createFragment(example);

					li.appendChild(frag.content);
					ul.appendChild(li);
				}

				li.appendChild(ul);
			}

			ol.appendChild(li);
		}
		popup.appendChild(ol);
	}
}

// Create a chunk of useful html from string
function createFragment(content) {
	const frag = document.createElement('template');
	frag.innerHTML = strip_tags(content);
	transform_links(frag);
	return frag;
}

// transform <a> elements of given document fragment
function transform_links(documentFragment) {
	documentFragment.content.querySelectorAll('a').forEach(transform_link);
}

// Chose to edit the href to "javascript:;" because... I had a good plan once. It's like that.
function transform_link(link) {
	// str = "/wiki/salutation heyo#English"  ---->  Array [ "/wiki/salutation heyo#", "salutation heyo" ]
	// let word = link.href.match(/\/wiki\/([\w\s]+)#?/)[1]

	// Using the title property instead.
	let word = link.title;
	// Replace spaces with underscores here. For Wiktionary.
	word = word.replace(/ /g, '_');
	// Bottom left indicator for link target. "javascript:;" is nicer than "MOZ-EXTENSION1231431___...."
	link.href = 'javascript:;';

	// Original was not found -> this is the "open edit page" link
	if (link.id === 'addWord') {
		link.href = EDITURL(word);
		link.addEventListener('click', (e) => {
			e.preventDefault();
			browser.tabs.create({
				url: EDITURL(word),
			});
		});
	}
	// Sometimes wiktionary gives "Appendix:Glossary" like links, so
	// if (it isn't like that.) {
	else if (word != null && !/:/g.test(word)) {
		link.onclick = () => define(word);
	} else {
		// so it is like that
		// the link is not going to work
		link.removeAttribute('href');
		link.removeAttribute('title');
	}
}

//http://locutus.io/php/strings/strip_tags/
function strip_tags(input) {
	//  discuss at: http://locutus.io/php/strip_tags/
	// original by: Kevin van Zonneveld (http://kvz.io)
	// improved by: Luke Godfrey
	// improved by: Kevin van Zonneveld (http://kvz.io)
	//    input by: Pul
	//    input by: Alex
	//    input by: Marc Palau
	//    input by: Brett Zamir (http://brett-zamir.me)
	//    input by: Bobby Drake
	//    input by: Evertjan Garretsen
	// bugfixed by: Kevin van Zonneveld (http://kvz.io)
	// bugfixed by: Onno Marsman (https://twitter.com/onnomarsman)
	// bugfixed by: Kevin van Zonneveld (http://kvz.io)
	// bugfixed by: Kevin van Zonneveld (http://kvz.io)
	// bugfixed by: Eric Nagel
	// bugfixed by: Kevin van Zonneveld (http://kvz.io)
	// bugfixed by: Tomasz Wesolowski
	// bugfixed by: Tymon Sturgeon (https://scryptonite.com)
	//  revised by: Rafał Kukawski (http://blog.kukawski.pl)
	//   example 1: strip_tags('<p>Kevin</p> <br /><b>van</b> <i>Zonneveld</i>', '<i><b>')
	//   returns 1: 'Kevin <b>van</b> <i>Zonneveld</i>'
	//   example 2: strip_tags('<p>Kevin <img src="someimage.png" onmouseover="someFunction()">van <i>Zonneveld</i></p>', '<p>')
	//   returns 2: '<p>Kevin van Zonneveld</p>'
	//   example 3: strip_tags("<a href='http://kvz.io'>Kevin van Zonneveld</a>", "<a>")
	//   returns 3: "<a href='http://kvz.io'>Kevin van Zonneveld</a>"
	//   example 4: strip_tags('1 < 5 5 > 1')
	//   returns 4: '1 < 5 5 > 1'
	//   example 5: strip_tags('1 <br/> 1')
	//   returns 5: '1  1'
	//   example 6: strip_tags('1 <br/> 1', '<br>')
	//   returns 6: '1 <br/> 1'
	//   example 7: strip_tags('1 <br/> 1', '<br><br/>')
	//   returns 7: '1 <br/> 1'
	//   example 8: strip_tags('<i>hello</i> <<foo>script>world<</foo>/script>')
	//   returns 8: 'hello world'
	// making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
	let allowed = ALLOWED_TAGS;
	allowed = (
		((allowed || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []
	).join('');
	var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
	var commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
	var before = input;
	var after = input;
	// recursively remove tags to ensure that the returned string doesn't contain forbidden tags after previous passes (e.g. '<<bait/>switch/>')
	while (true) {
		before = after;
		after = before
			.replace(commentsAndPhpTags, '')
			.replace(tags, function ($0, $1) {
				return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
			});
		// return once no more tags are removed
		if (before === after) {
			return after;
		}
	}
}
