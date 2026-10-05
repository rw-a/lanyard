/* @refresh reload */
import { render } from 'solid-js/web';
import './styles.css';
import App from './components/App';
import { initStore } from './lib/store';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Load the saved template and roster (IndexedDB) before the first paint so the
// app never flashes the default design or re-runs the starter-template logic.
initStore().then(() => {
  root.textContent = '';
  render(() => <App />, root);
});
