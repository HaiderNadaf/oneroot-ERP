import { redirect } from "next/navigation";

/** Moved into Users: this address opens its tab there */
export default function Page() {
  redirect("/admin/users?tab=department");
}
