import { mountCanvas } from '@thisismydesign/cursor-canvas-web/runtime';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';
import EnemyLevelSkipPlanner from '../.cursor/canvases/enemy-level-skip.canvas';

mountCanvas(
  'root',
  <div
    style={{
      maxWidth: 1280,
      margin: '0 auto',
      padding: 'clamp(16px, 4vw, 40px)',
    }}
  >
    <EnemyLevelSkipPlanner />
  </div>,
);
