import fs from "node:fs";
import path from "node:path";

export type RegisterPerson = {
  identifier: string;
  name: string;
  uniqueName: string;
  keyCricketArchive: string | null;
};

export type WorldRegister = {
  peopleById: Map<string, RegisterPerson>;
  cricketArchiveToId: Map<string, string>;
  nameToIds: Map<string, Set<string>>;
};

const REGISTER_DIRECTORY =
  path.join(
    process.cwd(),
    "scripts",
    "data",
    "world",
    "register"
  );

function fail(message: string): never {
  throw new Error(
    `[WORLD REGISTER] ${message}`
  );
}

function parseCsv(
  input: string
): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char =
      input[i];

    const next =
      input[i + 1];

    if (char === '"') {
      if (
        quoted &&
        next === '"'
      ) {
        field += '"';
        i++;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (
      char === "," &&
      !quoted
    ) {
      row.push(field);
      field = "";
      continue;
    }

    if (
      (char === "\n" ||
        char === "\r") &&
      !quoted
    ) {
      if (
        char === "\r" &&
        next === "\n"
      ) {
        i++;
      }

      row.push(field);
      field = "";

      if (
        row.some(
          (value) =>
            value.length > 0
        )
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);

  if (
    row.some(
      (value) =>
        value.length > 0
    )
  ) {
    rows.push(row);
  }

  return rows;
}

function readFile(
  fileName: string
): string {
  const filePath =
    path.join(
      REGISTER_DIRECTORY,
      fileName
    );

  if (
    !fs.existsSync(filePath)
  ) {
    fail(
      `Missing register file: ${filePath}. Run data:sync-world-identities first.`
    );
  }

  const value =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  if (!value.trim()) {
    fail(
      `Register file is empty: ${filePath}`
    );
  }

  return value;
}

export function normalizePersonName(
  value: string
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/^[*+#\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function loadWorldRegister(): WorldRegister {
  const peopleRows =
    parseCsv(
      readFile("people.csv")
    );

  const namesRows =
    parseCsv(
      readFile("names.csv")
    );

  if (
    peopleRows.length < 2
  ) {
    fail(
      "people.csv contains no player records."
    );
  }

  const header =
    peopleRows[0];

  const columnIndex =
    new Map<string, number>();

  header.forEach(
    (name, index) => {
      columnIndex.set(
        name.trim(),
        index
      );
    }
  );

  const requiredColumns = [
    "identifier",
    "name",
    "unique_name",
    "key_cricketarchive",
  ];

  for (const column of requiredColumns) {
    if (
      !columnIndex.has(column)
    ) {
      fail(
        `people.csv is missing required column "${column}".`
      );
    }
  }

  const peopleById =
    new Map<
      string,
      RegisterPerson
    >();

  const cricketArchiveToId =
    new Map<string, string>();

  const nameToIds =
    new Map<
      string,
      Set<string>
    >();

  for (
    const row of
    peopleRows.slice(1)
  ) {
    const identifier =
      row[
        columnIndex.get(
          "identifier"
        )!
      ]?.trim();

    const name =
      row[
        columnIndex.get(
          "name"
        )!
      ]?.trim();

    const uniqueName =
      row[
        columnIndex.get(
          "unique_name"
        )!
      ]?.trim();

    const keyCricketArchive =
      row[
        columnIndex.get(
          "key_cricketarchive"
        )!
      ]?.trim() || null;

    if (
      !identifier ||
      !/^[0-9a-f]{8}$/i.test(
        identifier
      ) ||
      !name
    ) {
      continue;
    }

    const person: RegisterPerson = {
      identifier:
        identifier.toLowerCase(),
      name,
      uniqueName:
        uniqueName || name,
      keyCricketArchive,
    };

    peopleById.set(
      person.identifier,
      person
    );

    const normalized =
      normalizePersonName(
        name
      );

    const ids =
      nameToIds.get(
        normalized
      ) ??
      new Set<string>();

    ids.add(
      person.identifier
    );

    nameToIds.set(
      normalized,
      ids
    );

    if (
      keyCricketArchive
    ) {
      if (
        cricketArchiveToId.has(
          keyCricketArchive
        ) &&
        cricketArchiveToId.get(
          keyCricketArchive
        ) !==
          person.identifier
      ) {
        fail(
          `CricketArchive identifier ${keyCricketArchive} maps to multiple Cricsheet IDs.`
        );
      }

      cricketArchiveToId.set(
        keyCricketArchive,
        person.identifier
      );
    }
  }

  if (
    namesRows.length >= 2
  ) {
    const nameHeader =
      namesRows[0];

    const identifierIndex =
      nameHeader.indexOf(
        "identifier"
      );

    const nameIndex =
      nameHeader.indexOf(
        "name"
      );

    if (
      identifierIndex >= 0 &&
      nameIndex >= 0
    ) {
      for (
        const row of
        namesRows.slice(1)
      ) {
        const identifier =
          row[
            identifierIndex
          ]?.trim()
            .toLowerCase();

        const name =
          row[
            nameIndex
          ]?.trim();

        if (
          !identifier ||
          !name ||
          !peopleById.has(
            identifier
          )
        ) {
          continue;
        }

        const normalized =
          normalizePersonName(
            name
          );

        const ids =
          nameToIds.get(
            normalized
          ) ??
          new Set<string>();

        ids.add(
          identifier
        );

        nameToIds.set(
          normalized,
          ids
        );
      }
    }
  }

  return {
    peopleById,
    cricketArchiveToId,
    nameToIds,
  };
}

export function resolveRegisterName(
  register: WorldRegister,
  rawName: string
): RegisterPerson {
  const normalized =
    normalizePersonName(
      rawName
    );

  const ids =
    register.nameToIds.get(
      normalized
    );

  if (!ids || ids.size === 0) {
    fail(
      `Unable to map CricketArchive player name "${rawName}" to the Cricsheet Register.`
    );
  }

  if (ids.size > 1) {
    fail(
      `Ambiguous CricketArchive player name "${rawName}". Candidate Cricsheet IDs: ${[
        ...ids,
      ].join(", ")}`
    );
  }

  const id =
    [...ids][0];

  const person =
    register.peopleById.get(
      id
    );

  if (!person) {
    fail(
      `Register ID ${id} was referenced but no people.csv record exists.`
    );
  }

  return person;
}