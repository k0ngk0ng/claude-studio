// Polyfills — must be imported before any module that uses them.
import 'react-native-get-random-values';
import 'text-encoding-polyfill';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
