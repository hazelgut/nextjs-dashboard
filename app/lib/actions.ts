"use server";

import z from "zod";
import postgres from "postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

const formSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.coerce.number(),
  status: z.enum(["pending", "paid"]),
  date: z.string(),
});

const CreateInvoiceShema = formSchema.omit({ id: true, date: true });
const UpdateInvoiceSchema = formSchema.omit({ id: true, date: true });

/*
formSchema
.omit({data: true})
.extend({
  sendEmailReceipt: z.boolean().default(false),
  discountCode: z.string().optional(),
})

const ModifiedAtSchema = z.object({
  modifiedAt: z.string()
})

const MergetInvoiceFormSchema = formSchema.merge(ModifiedAtSchema)

*/

export interface CreateInvoiceErrorState {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
}

const CreateInvoiceFormSchema = z.object({
  customerId: z.string({
    invalid_type_error: "Please select a customer.",
  }),
  amount: z.coerce.number().gt(0, {
    message: "Please enter amount greater than $0.",
  }),
  status: z.enum(["pending", "paid"], {
    invalid_type_error: "Please select an invoce status",
  }),
});

export async function createInvoice(
  prevState: CreateInvoiceErrorState,
  formData: FormData,
): Promise<CreateInvoiceErrorState> {
  const validatedFields = CreateInvoiceFormSchema.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Create Invoice.",
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split("T")[0];

  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date) 
    VALUES (${customerId},${amountInCents},${status},${date})
    `;
  } catch (error) {
    return {
      message: "Database Error: Failed to Create Invoice",
    };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export interface UpdateInvoiceErrorState {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
}

export async function updateInvoice(
  id: string,
  errorState: UpdateInvoiceErrorState,
  formData: FormData,
): Promise<UpdateInvoiceErrorState> {
  const validatedFields = CreateInvoiceFormSchema.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing fields. Failed to Update Invoice.",
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch (error) {
    return {
      message: "Database Error: Failed to Update Invoice",
    };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
  await sql`
    DELETE FROM invoices
    WHERE id = ${id}
  `;
  revalidatePath("/dashboard/invoices");
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}
