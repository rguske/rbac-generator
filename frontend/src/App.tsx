import { useEffect, useState } from 'react';
import {
  Masthead,
  MastheadBrand,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSidebar,
  PageSidebarBody,
} from '@patternfly/react-core';
import { LoginPageContainer } from './pages/Login';
import { ConnectionPage } from './pages/Connection';
import { CreatePage } from './pages/Create';
import { BrowsePage } from './pages/Browse';
import { getSession, logout, UNAUTHORIZED_EVENT } from './api/client';
import type { ClusterInfo } from './types/rbac';

type View = 'connection' | 'create' | 'browse';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | undefined>(undefined);
  const [view, setView] = useState<View>('connection');

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
        <MastheadBrand>rbac-generator</MastheadBrand>
      </MastheadMain>
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
      {view === 'create' && <CreatePage connected={Boolean(clusterInfo)} />}
      {view === 'browse' && <BrowsePage connected={Boolean(clusterInfo)} />}
    </Page>
  );
}
