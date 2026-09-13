import { defineMiddleware } from "astro:middleware";

const POST_PATH = /^\/fuckxter\/post\/([^/]+)\/[^/]+\/?$/i;
const USER_PATH = /^\/fuckxter\/user\/([^/]+)\/?$/i;

export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  if (POST_PATH.test(pathname)) return next("/fuckxter/post/");

  if (USER_PATH.test(pathname)) return next("/fuckxter/user/");

  return next();
});
