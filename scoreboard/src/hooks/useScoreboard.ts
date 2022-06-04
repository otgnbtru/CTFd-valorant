import { useEffect, useRef, useState } from "react";

import { io } from "socket.io-client";

import { ScoreboardItem } from "@/server/scoreboard";
import { SoundsManifest } from "@/server/sounds";

import { useTaskQueue } from "@/contexts/TaskQueueContext";

import { pickSound } from "@/core/sounds";
import { playSound } from "@/core/SoundDispatcher";

export function useScoreboard({
  endAt,
  sounds,
  agentPicks,
  initialScoreboard,
}: {
  endAt: number;
  sounds: SoundsManifest;
  agentPicks: Record<string, string>;
  initialScoreboard: ScoreboardItem[];
}) {
  const [scoreboard, setScoreboard] = useState(initialScoreboard);

  const scoreboardRef = useRef(scoreboard);
  useEffect(() => {
    scoreboardRef.current = scoreboard;
  }, [scoreboard]);
  const agentPicksRef = useRef(agentPicks);
  useEffect(() => {
    agentPicksRef.current = agentPicks;
  }, [agentPicks]);

  useEffect(() => {
    const now = Date.now() / 1000;
    const timeUntilEnd = endAt - now;
    if (timeUntilEnd <= 0) {
      return;
    }

    const timeout = setTimeout(async () => {
      const newScoreboard: ScoreboardItem[] = await fetch(
        "/api/scoreboard"
      ).then((res) => res.json());
      await playSound(`${agentPicksRef.current[newScoreboard[0].name]}/win`);
    }, timeUntilEnd * 1000);
    return () => clearTimeout(timeout);
  }, [endAt]);

  const taskQueue = useTaskQueue();
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_BACKEND_URL as string);
    socket.on(
      "submission",
      async (submission: {
        success: boolean;
        team: { id: number; name: string };
      }) => {
        if (!submission.success) {
          setScoreboard((scoreboard) =>
            scoreboard.map((standing) => {
              if (standing.id === submission.team.id) {
                return { ...standing, fails: standing.fails + 1 };
              }
              return standing;
            })
          );
          return;
        }

        const newScoreboard: ScoreboardItem[] = await fetch(
          "/api/scoreboard"
        ).then((res) => res.json());
        const sound = pickSound({
          team: submission.team.name,
          agentPicks: agentPicksRef.current,
          soundManifest: sounds,
          oldScoreboard: scoreboardRef.current,
          newScoreboard,
        });
        taskQueue.push(async () => {
          await playSound("kill");
          setScoreboard(newScoreboard);
          await playSound(sound.id);
        });
      }
    );
    return () => {
      socket.close();
    };
  }, [sounds, taskQueue]);

  return { scoreboard };
}
