// @errors: 1070 2515
interface ITodos {
  method(): string;
}
declare const Todos: {interface: ITodos}
declare const implementing: (mod: any) => abstract new() => {
  abstract method(): string;
};
// ---cut---
class TodosImpl extends implementing(Todos) {

}