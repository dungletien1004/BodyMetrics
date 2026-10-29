"use client";

import { useActionState, useEffect, useRef } from "react";
import { createExercise } from "@/app/workouts/exercises/actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/workouts";

export function AddExerciseForm() {
  const [state, action, pending] = useActionState(createExercise, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid grid-cols-2 gap-3">
      <Field label="Tên bài tập" className="col-span-2">
        <Input name="name" required maxLength={80} placeholder="VD: Cable fly" />
      </Field>
      <Field label="Loại">
        <Select name="category" defaultValue="strength">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="MET">
        <Input name="met" required inputMode="decimal" placeholder="VD: 3,5" />
      </Field>
      <Field label="Nhóm cơ" className="col-span-2" hint="Tuỳ chọn">
        <Input name="muscleGroup" maxLength={40} placeholder="VD: Ngực" />
      </Field>
      <div className="col-span-2 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang thêm…" : "Thêm bài tập"}
        </Button>
        {state?.error && <span className="text-sm text-danger">{state.error}</span>}
        {state?.ok && <span className="text-sm text-accent">{state.ok}</span>}
      </div>
    </form>
  );
}
