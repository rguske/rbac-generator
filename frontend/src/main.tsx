import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import { App } from './App';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
