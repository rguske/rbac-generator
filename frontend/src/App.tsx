import { useEffect, useState } from 'react';
import logo from './assets/logo.png';
import {
  Button,
  Label,
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { GithubIcon, MoonIcon, SunIcon } from '@patternfly/react-icons';
import { LoginPageContainer } from './pages/Login';
import { ConnectionPage } from './pages/Connection';
import { CreatePage } from './pages/Create';
import { BrowsePage } from './pages/Browse';
import { TemplatesPage } from './pages/Templates';
import { getSession, logout, UNAUTHORIZED_EVENT } from './api/client';
import type { ClusterInfo, Kind, RbacResource } from './types/rbac';

type View = 'connection' | 'create' | 'browse' | 'templates';
type Theme = 'light' | 'dark';

const APP_VERSION = 'v1.0';
const GITHUB_REPO_URL = 'https://github.com/rguske/rbac-generator';
const THEME_STORAGE_KEY = 'rbac-generator-theme';
const DARK_THEME_CLASS = 'pf-v6-theme-dark';

function getStoredTheme(): Theme {
  // Use window.localStorage explicitly: Node 22+'s experimental global
  // `localStorage` can otherwise shadow jsdom's implementation in tests.
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | undefined>(undefined);
  const [view, setView] = useState<View>('connection');
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [createPrefill, setCreatePrefill] = useState<{ kind: Kind; resource: RbacResource; nonce: number } | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    getSession()
      .then((info) => {
        setAuthenticated(info.authenticated);
        setClusterInfo(info.clusterInfo);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    // If the server-side session expires (TTL janitor) while this tab still
    // believes it's authenticated, any subsequent API call gets a 401; fall
    // back to the Login page instead of leaving the user stuck on a page
    // that silently keeps failing.
    const handleUnauthorized = () => {
      setAuthenticated(false);
      setClusterInfo(undefined);
      setView('connection');
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  if (authenticated === null) {
    return null;
  }

  if (!authenticated) {
    return <LoginPageContainer onLoggedIn={() => setAuthenticated(true)} />;
  }

  const handleLogout = async () => {
    await logout();
    setAuthenticated(false);
    setClusterInfo(undefined);
    setView('connection');
    setCreatePrefill(null);
  };

  const handleUseTemplate = (kind: Kind, resource: RbacResource) => {
    setCreatePrefill((prev) => ({ kind, resource, nonce: (prev?.nonce ?? 0) + 1 }));
    setView('create');
  };

  const sidebar = (
    <PageSidebar>
      <PageSidebarBody>
        <Nav>
          <NavList>
            <NavItem isActive={view === 'connection'} onClick={() => setView('connection')}>
              Connection
            </NavItem>
            <NavItem isActive={view === 'create'} onClick={() => setView('create')}>
              Create
            </NavItem>
            <NavItem isActive={view === 'templates'} onClick={() => setView('templates')}>
              Templates
            </NavItem>
            <NavItem isActive={view === 'browse'} onClick={() => setView('browse')}>
              Browse
            </NavItem>
            <NavItem onClick={handleLogout}>Log out</NavItem>
          </NavList>
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );

  const masthead = (
    <Masthead>
      <MastheadMain>
        <MastheadBrand>
          <img src={logo} alt="RBAC-Generator logo" style={{ height: '32px', marginRight: '0.5rem' }} />
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1.2 }}>RBAC-Generator</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.85, lineHeight: 1.2 }}>
              Build and apply Kubernetes RBAC resources.
            </div>
          </div>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <Button
                  variant="plain"
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </Button>
              </ToolbarItem>
              <ToolbarItem>
                <Button
                  variant="plain"
                  aria-label="View source on GitHub"
                  component="a"
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon />
                </Button>
              </ToolbarItem>
              <ToolbarItem>
                <Label isCompact>{APP_VERSION}</Label>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  return (
    <Page sidebar={sidebar} masthead={masthead}>
      {view === 'connection' && (
        <ConnectionPage
          clusterInfo={clusterInfo}
          onConnected={(info) => setClusterInfo(info)}
          onDisconnected={() => setClusterInfo(undefined)}
        />
      )}
      {view === 'create' && (
        <CreatePage
          key={createPrefill?.nonce}
          connected={Boolean(clusterInfo)}
          initialKind={createPrefill?.kind}
          initialResource={createPrefill?.resource}
        />
      )}
      {view === 'templates' && <TemplatesPage onUseTemplate={handleUseTemplate} />}
      {view === 'browse' && <BrowsePage connected={Boolean(clusterInfo)} />}
    </Page>
  );
}
