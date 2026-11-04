'use strict';

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const STORAGE_FAVORITES = 'wordly:favorites';
const STORAGE_THEME = 'wordly:theme';
const form = document.querySelector('#search-form');
const input = document.querySelector('#word-input');
const status = document.querySelector('#status');
const results = document.querySelector('#result-panel');
const searchButton = document.querySelector('#search-button');
const themeButton = document.querySelector('#theme-toggle');
const favoritesButton = document.querySelector('#favorites-toggle');
const favoritesPanel = document.querySelector('#favorites-panel');
const favoritesList = document.querySelector('#favorites-list');
const savedCount = document.querySelector('#saved-count');
let currentWord = '';
let currentAudio = '';
let activeRequest = null;

function readFavorites() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_FAVORITES) || '[]');
    return Array.isArray(data) ? data.filter(word => typeof word === 'string') : [];
  } catch { return []; }
}
let favorites = readFavorites();

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}
function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function saveFavorites() {
  try { localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(favorites)); }
  catch { setStatus('Saved words cannot be stored in this browser.', true); }
  renderFavorites();
}
function renderFavorites() {
  savedCount.textContent = String(favorites.length);
  favoritesList.replaceChildren();
  if (!favorites.length) {
    favoritesList.append(element('li', 'aside-description', 'No saved words yet. Search a word and select ☆ Save.'));
    return;
  }
  favorites.forEach(word => {
    const item = element('li');
    const open = element('button', 'word-link', word);
    open.type = 'button';
    open.addEventListener('click', () => {
      input.value = word;
      searchWord(word);
    });
    const remove = element('button', 'remove-button', '✕');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${word} from saved words`);
    remove.addEventListener('click', () => {
      favorites = favorites.filter(saved => saved !== word);
      saveFavorites();
      updateSaveButton();
    });
    item.append(open, remove);
    favoritesList.append(item);
  });
}
function updateSaveButton() {
  const button = document.querySelector('#save-word');
  if (!button || !currentWord) return;
  const saved = favorites.includes(currentWord.toLowerCase());
  button.textContent = saved ? '★ Saved' : '☆ Save';
  button.setAttribute('aria-pressed', String(saved));
}
function toggleFavorite() {
  if (!currentWord) return;
  const word = currentWord.toLowerCase();
  favorites = favorites.includes(word) ? favorites.filter(item => item !== word) : [...favorites, word];
  saveFavorites();
  updateSaveButton();
}
function showMessage(title, message) {
  const box = element('div', 'empty-state');
  box.append(element('div', 'empty-icon', '🔎'), element('h2', '', title), element('p', '', message));
  results.replaceChildren(box);
}
function renderEntry(entries) {
  const entry = entries[0];
  currentWord = entry.word || input.value.trim();
  currentAudio = entries.flatMap(item => item.phonetics || []).find(item => item.audio)?.audio || '';
  results.replaceChildren();
  const header = element('div', 'word-header');
  const heading = element('div');
  heading.append(element('h2', '', currentWord));
  const phonetic = entry.phonetic || entry.phonetics?.find(item => item.text)?.text;
  if (phonetic) heading.append(element('p', 'phonetic', phonetic));
  const actions = element('div', 'word-actions');
  const play = element('button', 'icon-button', '🔊 Listen');
  play.type = 'button';
  play.disabled = !currentAudio;
  play.title = currentAudio ? 'Play pronunciation' : 'Audio pronunciation unavailable';
  play.addEventListener('click', async () => {
    if (!currentAudio) return;
    try { await new Audio(currentAudio).play(); }
    catch { setStatus('Unable to play audio on this device.', true); }
  });
  const save = element('button', 'icon-button');
  save.type = 'button';
  save.id = 'save-word';
  save.addEventListener('click', toggleFavorite);
  actions.append(play, save);
  header.append(heading, actions);
  results.append(header);
  updateSaveButton();

  let definitionCount = 0;
  for (const item of entries) {
    for (const meaning of item.meanings || []) {
      const section = element('section', 'meaning');
      section.append(element('h3', 'part-of-speech', meaning.partOfSpeech || 'Meaning'));
      const list = element('ol', 'definition-list');
      for (const definition of (meaning.definitions || []).slice(0, 5)) {
        const li = element('li', '', definition.definition || 'Definition unavailable.');
        if (definition.example) li.append(element('p', 'example', `“${definition.example}”`));
        list.append(li);
        definitionCount++;
      }
      section.append(list);
      const synonyms = [...new Set([...(meaning.synonyms || []), ...(meaning.definitions || []).flatMap(def => def.synonyms || [])])].slice(0, 10);
      if (synonyms.length) {
        const group = element('div', 'synonyms');
        group.append(element('strong', '', 'Synonyms: '));
        synonyms.forEach(word => group.append(element('span', 'chip', word)));
        section.append(group);
      }
      results.append(section);
    }
  }
  if (!definitionCount) results.append(element('p', 'aside-description', 'No definitions are available for this word.'));
}
async function searchWord(rawWord) {
  const word = rawWord.trim();
  if (!word) {
    setStatus('Please enter a word to search.', true);
    input.focus();
    return;
  }
  if (activeRequest) activeRequest.abort();
  const controller = new AbortController();
  activeRequest = controller;
  searchButton.disabled = true;
  searchButton.textContent = 'Searching…';
  setStatus(`Looking up “${word}”…`);
  try {
    const response = await fetch(`${API_BASE}${encodeURIComponent(word)}`, {signal: controller.signal});
    if (!response.ok) {
      if (response.status === 404) {
        showMessage('Word not found', `We couldn't find “${word}”. Check the spelling and try again.`);
        setStatus('No dictionary entry found.', true);
        return;
      }
      throw new Error(`Dictionary service returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error('Unexpected dictionary response');
    renderEntry(data);
    setStatus(`Showing results for “${data[0].word || word}”.`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    showMessage('Search unavailable', 'Please check your internet connection and try again.');
    setStatus('Unable to retrieve the definition right now.', true);
    console.error('Dictionary lookup failed:', error);
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
      searchButton.disabled = false;
      searchButton.textContent = 'Search word →';
    }
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  searchWord(input.value);
});
favoritesButton.addEventListener('click', () => {
  favoritesPanel.hidden = !favoritesPanel.hidden;
  favoritesButton.setAttribute('aria-expanded', String(!favoritesPanel.hidden));
});
document.querySelector('#close-favorites').addEventListener('click', () => {
  favoritesPanel.hidden = true;
  favoritesButton.setAttribute('aria-expanded', 'false');
});
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === 'dark' ? '☀️ Theme' : '🌙 Theme';
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}
let theme = 'light';
try { theme = localStorage.getItem(STORAGE_THEME) === 'dark' ? 'dark' : 'light'; } catch { /* storage unavailable */ }
applyTheme(theme);
themeButton.addEventListener('click', () => {
  theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem(STORAGE_THEME, theme); } catch { /* storage unavailable */ }
});
renderFavorites();
