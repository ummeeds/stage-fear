'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { assetPath } from '@/lib/paths';

type StageGameProps = {
  characterIndex: number;
  activeHeckler: string | null;
  recording: boolean;
  phase: 'enter' | 'announce' | 'ready';
  themeTitle: string;
};

type PhaserModule = typeof import('phaser');
type PhaserGame = import('phaser').Game;
type PhaserScene = import('phaser').Scene;

const HECKLERS = [
  { id: 'skeptic', color: 0x61e02d },
  { id: 'teen', color: 0x22b9f2 },
  { id: 'know_it_all', color: 0xffcc25 },
  { id: 'classic_heckler', color: 0xff352d },
  { id: 'nervous', color: 0xa54cff },
  { id: 'critic', color: 0xd7d9df },
];

const PLAYERS = ['rookie', 'beanie', 'prof', 'blue', 'flare', 'violet'];

function drawBackHeckler(scene: PhaserScene, x: number, y: number, scale: number, color: number, active: boolean) {
  const g = scene.add.graphics();
  const alpha = active ? 1 : 0.45;
  const bodyColor = active ? color : 0x0b0f19;

  if (active) {
    g.fillStyle(color, 0.28);
    g.fillEllipse(x, y - 34 * scale, 112 * scale, 42 * scale);
    g.lineStyle(5 * scale, color, 0.9);
    g.strokeEllipse(x, y - 34 * scale, 92 * scale, 34 * scale);
  }

  g.fillStyle(bodyColor, active ? 0.46 : alpha);
  g.fillRoundedRect(x - 33 * scale, y - 54 * scale, 66 * scale, 54 * scale, 12 * scale);
  g.fillStyle(active ? color : 0x121723, active ? 0.62 : 0.5);
  g.fillRoundedRect(x - 21 * scale, y - 78 * scale, 42 * scale, 36 * scale, 16 * scale);
  g.fillStyle(0x05070d, 0.75);
  g.fillRect(x - 25 * scale, y - 43 * scale, 50 * scale, 7 * scale);

  if (active) {
    g.y = -5 * scale;
  }

  return g;
}

function createStageScene(Phaser: PhaserModule, propsRef: MutableRefObject<StageGameProps>) {
  return class StageScene extends Phaser.Scene {
    private avatar?: import('phaser').GameObjects.Image;
    private avatarTween?: import('phaser').Tweens.Tween;
    private walkTween?: import('phaser').Tweens.Tween;

    constructor() {
      super('StageScene');
    }

    preload() {
      PLAYERS.forEach((name, index) => {
        this.load.image(`player-${index}`, assetPath(`/sprites/players/${name}.png`));
      });
    }

    create() {
      this.game.registry.set('Phaser', Phaser);
      this.scale.on('resize', () => this.redraw());
      this.game.events.on('stage:update', () => this.redraw());
      this.redraw();
    }

    redraw() {
      this.avatarTween?.stop();
      this.walkTween?.stop();
      this.children.removeAll(true);

      const props = propsRef.current;
      const w = this.scale.width;
      const h = this.scale.height;
      const floorY = h * 0.64;
      const stageCenterX = w * 0.5;

      const bg = this.add.graphics();
      bg.fillGradientStyle(0x050711, 0x050711, 0x151721, 0x080a12, 1);
      bg.fillRect(0, 0, w, h);

      bg.fillStyle(0x151924, 0.86);
      bg.fillRect(w * 0.14, 0, w * 0.72, 54);
      bg.lineStyle(3, 0x282e3b, 0.66);
      for (let x = w * 0.15; x < w * 0.86; x += 44) {
        bg.lineBetween(x, 0, x - 36, 54);
      }

      bg.fillStyle(0x4c0f1d, 0.9);
      bg.fillRect(0, 38, w * 0.14, h * 0.62);
      bg.fillRect(w * 0.86, 38, w * 0.14, h * 0.62);
      bg.fillStyle(0x751428, 0.74);
      for (let x = 12; x < w * 0.14; x += 22) bg.fillRect(x, 38, 6, h * 0.62);
      for (let x = w * 0.87; x < w; x += 22) bg.fillRect(x, 38, 6, h * 0.62);

      bg.fillStyle(0xffb06a, 0.23);
      bg.fillTriangle(stageCenterX - 35, 58, stageCenterX + 35, 58, stageCenterX + w * 0.18, floorY + 12);
      bg.fillTriangle(stageCenterX + 35, 58, stageCenterX - 35, 58, stageCenterX - w * 0.18, floorY + 12);

      bg.fillStyle(0x3b1f13, 1);
      bg.fillEllipse(stageCenterX, floorY + 58, w * 0.66, h * 0.22);
      bg.fillStyle(0x773817, 0.86);
      bg.fillEllipse(stageCenterX, floorY + 44, w * 0.58, h * 0.12);
      bg.lineStyle(2, 0x2c130b, 0.34);
      for (let y = floorY + 8; y < floorY + 92; y += 13) {
        bg.lineBetween(w * 0.2, y, w * 0.84, y);
      }

      const label = this.add.text(stageCenterX, 92, props.themeTitle.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: `${Math.max(14, Math.round(w / 62))}px`,
        color: '#f3efe3',
        stroke: '#1a1d26',
        strokeThickness: 5,
      });
      label.setOrigin(0.5);

      const crowd = this.add.graphics();
      crowd.fillGradientStyle(0x070a13, 0x070a13, 0x010209, 0x010209, 0.96);
      crowd.fillRect(0, h * 0.68, w, h * 0.32);

      const rows = [
        { y: h * 0.78, step: 74, offset: 8, s: 1 },
        { y: h * 0.9, step: 86, offset: 42, s: 1.16 },
      ];
      rows.forEach((row) => {
        for (let x = row.offset; x < w + 80; x += row.step) {
          crowd.fillStyle(0x090d17, 1);
          crowd.fillRoundedRect(x - 30 * row.s, row.y - 38 * row.s, 60 * row.s, 38 * row.s, 18 * row.s);
          crowd.fillStyle(0x101525, 0.78);
          crowd.fillEllipse(x, row.y - 38 * row.s, 56 * row.s, 22 * row.s);
        }
      });

      const positions = [
        [w * 0.18, h * 0.78, 1.1],
        [w * 0.31, h * 0.89, 1.22],
        [w * 0.45, h * 0.76, 1.08],
        [w * 0.58, h * 0.88, 1.25],
        [w * 0.72, h * 0.77, 1.1],
        [w * 0.86, h * 0.89, 1.2],
      ];
      HECKLERS.forEach((heckler, index) => {
        const [x, y, s] = positions[index];
        drawBackHeckler(this, x, y, s as number, heckler.color, props.activeHeckler === heckler.id);
      });

      const avatarX = props.phase === 'enter' ? w * 0.16 : stageCenterX;
      const avatarY = floorY + 16;
      const playerKey = `player-${Math.max(0, Math.min(PLAYERS.length - 1, props.characterIndex))}`;
      this.avatar = this.add.image(avatarX, avatarY, playerKey);
      this.avatar.setOrigin(0.5, 1);
      const avatarHeight = Math.min(228, Math.max(168, h * 0.39));
      this.avatar.setDisplaySize(avatarHeight * 0.58, avatarHeight);
      this.avatar.setDepth(5);

      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.38);
      shadow.fillEllipse(this.avatar.x, avatarY + 2, w * 0.09, h * 0.04);

      if (props.phase === 'enter') {
        this.tweens.add({
          targets: [this.avatar, shadow],
          x: stageCenterX,
          duration: 2900,
          ease: 'Sine.easeInOut',
        });
        this.walkTween = this.tweens.add({
          targets: this.avatar,
          y: avatarY - 8,
          angle: 1.5,
          duration: 180,
          yoyo: true,
          repeat: -1,
          ease: 'Stepped',
          easeParams: [2],
        });
        this.time.delayedCall(2920, () => {
          this.walkTween?.stop();
          this.avatar?.setAngle(0);
          this.avatar?.setY(avatarY);
        });
      }

      if (props.recording || props.phase !== 'enter') {
        this.avatarTween = this.tweens.add({
          targets: this.avatar,
          y: avatarY - 3,
          duration: 1450,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  };
}

export default function StageGame(props: StageGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGame | null>(null);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
    gameRef.current?.events.emit('stage:update');
  }, [props]);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      const Phaser = await import('phaser');
      if (!mounted || !hostRef.current || gameRef.current) return;

      const StageScene = createStageScene(Phaser, propsRef);
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        backgroundColor: '#050711',
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: hostRef.current.clientWidth,
          height: hostRef.current.clientHeight,
        },
        render: {
          pixelArt: true,
          antialias: false,
        },
        scene: StageScene,
      });
    };

    boot();

    return () => {
      mounted = false;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="phaser-stage" aria-hidden="true" />;
}
