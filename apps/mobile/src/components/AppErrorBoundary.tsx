import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  recoveryKey: number;
}

/**
 * Last-resort UI containment for unexpected React render/lifecycle failures.
 *
 * The fallback intentionally never renders raw exception messages or stacks.
 * Development builds still emit diagnostics to the local console. Retrying
 * remounts the protected subtree from a clean React state.
 */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    recoveryKey: 0,
  };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) {
      console.error('iRexPro mobile app shell error', error, info);
    }
  }

  private retry = () => {
    this.setState((state) => ({
      hasError: false,
      recoveryKey: state.recoveryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={styles.container}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            iRexPro could not display this screen. Your secure session has not been cleared.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry iRexPro"
            style={styles.button}
            onPress={this.retry}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1020',
    padding: 24,
  },
  title: {
    color: '#e8edff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  message: {
    color: '#9aa7c7',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#14b8a6',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  buttonText: {
    color: '#06231f',
    fontSize: 15,
    fontWeight: '700',
  },
});
