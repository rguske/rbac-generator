// frontend/src/pages/Login.tsx
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { LoginPage, LoginForm } from '@patternfly/react-core';
import { login } from '../api/client';

interface LoginPageContainerProps {
  onLoggedIn: () => void;
}

export function LoginPageContainer({ onLoggedIn }: LoginPageContainerProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LoginPage loginTitle="Log in to rbac-generator" textContent="Build and apply Kubernetes RBAC resources.">
      <LoginForm
        usernameLabel="Username"
        passwordLabel="Password"
        usernameValue={username}
        passwordValue={password}
        onChangeUsername={(_e, value) => setUsername(value)}
        onChangePassword={(_e, value) => setPassword(value)}
        onLoginButtonClick={handleSubmit}
        isLoginButtonDisabled={submitting}
        loginButtonLabel={submitting ? 'Logging in...' : 'Log in'}
        helperText={error ?? undefined}
        showHelperText={Boolean(error)}
      />
    </LoginPage>
  );
}
