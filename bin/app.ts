import { App, Tags } from "aws-cdk-lib";
import { GuessGameStack } from "../lib/guess-game-stack";

const app = new App();

// Environment-agnostic: deployed to the account/region of the AWS profile running `cdk deploy`.
new GuessGameStack(app, "GuessTheNumberStack");

Tags.of(app).add("project", "guess-the-number");
