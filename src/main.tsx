import { mountCanvas } from '@thisismydesign/cursor-canvas-web/runtime';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import EnemyLevelSkipPlanner from '../.cursor/canvases/enemy-level-skip.canvas';

mountCanvas('root', <EnemyLevelSkipPlanner />);
