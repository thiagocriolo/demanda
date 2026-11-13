import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  contactDetail,
  businessDetail,
  projectDetail,
  taskDetail,
} from "$lib/records/record-detail";
import { recordTabFromRoute } from "$lib/records/record-page";
import {
  getBusinessOperations,
  getProjectOperations,
} from "$lib/server/records/operations";
import {
  getContactOperationalDashboard,
  getWorkspaceContact,
  ContactNotFoundError,
} from "$lib/server/contacts/service";
import {
  getWorkspaceBusiness,
  BusinessNotFoundError,
} from "$lib/server/businesses/service";
import {
  getWorkspaceProject,
  ProjectNotFoundError,
} from "$lib/server/projects/service";
import { getWorkspaceTask, TaskNotFoundError } from "$lib/server/tasks/service";
import { listWorkspaceTaskComments } from "$lib/server/tasks/comments";

const recordIdSchema = z.string().uuid();

/**
 * Detail pages load the record through the same workspace-scoped services as
 * the API. A guessed ID can therefore never disclose another user's record.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsedId = recordIdSchema.safeParse(params.recordId);
  const tab = recordTabFromRoute(params.tab);
  if (!parsedId.success || !tab) error(404, "Registro não encontrado.");

  try {
    const database = getDatabase();
    if (tab === "pessoas") {
      const contact = await getWorkspaceContact(
        database,
        context,
        parsedId.data,
      );
      return {
        detail: contactDetail(contact),
        contactDashboard: await getContactOperationalDashboard(
          database,
          contact,
        ),
        backHref: "/registros/contatos",
      };
    }
    if (tab === "negocios") {
      const business = await getWorkspaceBusiness(
        database,
        context,
        parsedId.data,
      );
      return {
        detail: businessDetail(business),
        businessDashboard: await getBusinessOperations(database, business),
        backHref: "/registros/negócios",
      };
    }
    if (tab === "projetos") {
      const project = await getWorkspaceProject(
        database,
        context,
        parsedId.data,
      );
      return {
        detail: projectDetail(project),
        projectDashboard: await getProjectOperations(database, project),
        projectActive: project.isActive,
        backHref: "/registros/projetos",
      };
    }
    const task = await getWorkspaceTask(database, context, parsedId.data);
    return {
      detail: taskDetail(task),
      taskComments: await listWorkspaceTaskComments(database, context, task.id),
      backHref: "/registros/tarefas",
    };
  } catch (cause) {
    if (
      cause instanceof ContactNotFoundError ||
      cause instanceof BusinessNotFoundError ||
      cause instanceof ProjectNotFoundError ||
      cause instanceof TaskNotFoundError
    ) {
      error(404, "Registro não encontrado.");
    }
    throw cause;
  }
};
