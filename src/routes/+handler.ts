import * as v from 'valibot';
import { addMessage, listMessages } from '../lib/messages';

const messageForm = v.object({
  author: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40)), ''),
  text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
});

export const GET = Run.GET((ctx, next) => next({ error: undefined, messages: listMessages() }));

// Plain <form method="post">: validate, append, then POST-redirect-GET.
export const POST = Run.POST({ form: messageForm }, async (ctx, next) => {
  const [body, issues] = await ctx.body;
  if (issues) {
    return next({ error: "Message can't be empty", messages: listMessages() });
  }
  addMessage(body.author || 'anonymous', body.text);
  return ctx.redirect('/', 303);
});
